import os
import sys
import re
import json
import time
import wave
import struct
import hashlib
import platform
import threading
import queue
from pathlib import Path
from datetime import datetime

import numpy as np
import soundcard as sc
import psutil


# ============================================================
# QUIETRECORDER ENGINE V4.0
# CROSS-PLATFORM CAPTURE ARCHITECTURE
#
# Core:
#   - Platform-independent recording engine
#   - Independent capture and writer threads
#   - Bounded queues
#   - WAV output
#   - Format-aware validation
#   - Session manifest
#
# Audio backend:
#   - SoundCard
#   - Windows / WASAPI
#   - Linux / PulseAudio
#   - macOS / CoreAudio
#
# Optional application backend:
#   - Windows ProcessAudioCapture
#
# No GUI. Single Python file.
# ============================================================


CONFIG = {
    "OUTPUT": "output",

    "SAMPLE_RATE": 48000,
    "BLOCK_SECONDS": 0.25,
    "QUEUE_SIZE": 80,

    "DASHBOARD_REFRESH": 1,
    "APP_SCAN_INTERVAL": 2,

    "SILENCE_THRESHOLD": 0.001,
    "SILENCE_WARNING_SECONDS": 10,

    "VALIDATION_CHUNK_FRAMES": 16384,

    "ENABLE_MICROPHONES": True,
    "ENABLE_SYSTEM_AUDIO": True,
    "ENABLE_APPLICATION_AUDIO": True,

    "EXCLUDE_SELF_PROCESS": True,
}


PLATFORM = platform.system()

SESSION_ID = datetime.now().strftime(
    "%Y-%m-%d_%H-%M-%S"
)

SESSION_DIR = (
    Path(CONFIG["OUTPUT"]) / SESSION_ID
)

START_TIME = time.time()

STOP_EVENT = threading.Event()

WORKERS = []
APP_WORKERS = {}

APP_LOCK = threading.Lock()

PROCESS_AUDIO_CAPTURE = None
APP_BACKEND_AVAILABLE = False
APP_BACKEND_SUPPORTED = False
APP_BACKEND_ERROR = None


# ============================================================
# PLATFORM CAPABILITY DETECTION
# ============================================================

def detect_platform():

    return {
        "system": platform.system(),
        "release": platform.release(),
        "version": platform.version(),
        "machine": platform.machine(),
        "python": platform.python_version(),
        "architecture": platform.architecture()[0],
    }


def initialize_application_backend():

    global PROCESS_AUDIO_CAPTURE
    global APP_BACKEND_AVAILABLE
    global APP_BACKEND_SUPPORTED
    global APP_BACKEND_ERROR

    if not CONFIG["ENABLE_APPLICATION_AUDIO"]:
        APP_BACKEND_ERROR = "Disabled in configuration."
        return

    if PLATFORM != "Windows":

        APP_BACKEND_ERROR = (
            "The installed ProcessAudioCapture backend "
            "supports Windows only."
        )

        return

    try:

        from process_audio_capture import ProcessAudioCapture

        PROCESS_AUDIO_CAPTURE = ProcessAudioCapture
        APP_BACKEND_AVAILABLE = True

        APP_BACKEND_SUPPORTED = bool(
            PROCESS_AUDIO_CAPTURE.is_supported()
        )

        if not APP_BACKEND_SUPPORTED:

            APP_BACKEND_ERROR = (
                "Windows process-loopback requirements "
                "are not satisfied."
            )

    except Exception as error:

        APP_BACKEND_ERROR = str(error)


# ============================================================
# GENERAL UTILITIES
# ============================================================

def safe_name(value):

    return (
        re.sub(
            r"[^A-Za-z0-9_-]+",
            "_",
            str(value)
        ).strip("_")[:70]
        or "unknown"
    )


def format_duration(seconds):

    seconds = max(0, int(seconds))

    hours, remainder = divmod(seconds, 3600)
    minutes, seconds = divmod(remainder, 60)

    return f"{hours:02}:{minutes:02}:{seconds:02}"


def format_bytes(value):

    value = float(value)

    for unit in ("B", "KB", "MB", "GB", "TB"):

        if value < 1024 or unit == "TB":
            return f"{value:.2f} {unit}"

        value /= 1024

    return f"{value:.2f} TB"


def rms_to_db(value):

    if value <= 0:
        return "-INF"

    return f"{20 * np.log10(value):.1f} dB"


def analyze_audio(audio):

    samples = np.asarray(
        audio,
        dtype=np.float32
    )

    if samples.size == 0:
        return 0.0, 0.0

    samples = np.nan_to_num(samples)

    peak = float(
        np.max(np.abs(samples))
    )

    rms = float(
        np.sqrt(np.mean(samples ** 2))
    )

    return peak, rms


def file_info(path):

    try:

        if not path.exists():

            return {
                "exists": False,
                "size": 0,
                "modified": None
            }

        stat = path.stat()

        return {
            "exists": True,
            "size": stat.st_size,
            "modified": stat.st_mtime
        }

    except Exception:

        return {
            "exists": False,
            "size": 0,
            "modified": None
        }


def create_output(source_type, source_name):

    folder = (
        SESSION_DIR
        / source_type
        / safe_name(source_name)
    )

    folder.mkdir(
        parents=True,
        exist_ok=True
    )

    return folder / "audio.wav"


# ============================================================
# MICROPHONE ACCESS PREFLIGHT
# ============================================================

def check_microphone_access(device):
    """
    Test whether this Python process can open and read from a
    microphone. This does not display a custom OS permission dialog.
    Windows desktop microphone access is controlled by Windows
    microphone privacy settings.
    """

    print("\n" + "=" * 78)
    print("                    MICROPHONE ACCESS CHECK")
    print("=" * 78)
    print(f"[PERMISSION] Device: {device.name}")
    print("[PERMISSION] Testing microphone access...")

    try:
        test_frames = 1024

        recorder = device.recorder(
            samplerate=CONFIG["SAMPLE_RATE"],
            blocksize=test_frames
        )

        with recorder:
            audio = recorder.record(numframes=test_frames)

        if audio is None or len(audio) == 0:
            print("[PERMISSION] STATUS: ACCESS TEST FAILED")
            print("[PERMISSION] The device returned no audio frames.")
            return "UNAVAILABLE"

        print("[PERMISSION] STATUS: ACCESS GRANTED")
        print("[PERMISSION] Microphone opened and audio frames received.")
        return "GRANTED"

    except PermissionError as error:
        print("[PERMISSION] STATUS: ACCESS DENIED")
        print(f"[PERMISSION] Reason: {error}")
        return "DENIED"

    except Exception as error:
        message = str(error).lower()

        permission_indicators = (
            "access denied",
            "permission denied",
            "not permitted",
            "unauthorized",
            "access is denied",
            "microphone permission",
            "privacy setting",
        )

        if any(indicator in message for indicator in permission_indicators):
            status = "DENIED"
        else:
            status = "UNAVAILABLE"

        print(f"[PERMISSION] STATUS: {status}")
        print(f"[PERMISSION] Reason: {error}")
        return status

    finally:
        print("=" * 78)
        print()


# ============================================================
# AUDIO DEVICE DISCOVERY
# ============================================================

def discover_sources():

    sources = []

    print(
        f"[DISCOVERY] Platform: {PLATFORM}"
    )

    # --------------------------------------------------------
    # Microphones
    # --------------------------------------------------------

    if CONFIG["ENABLE_MICROPHONES"]:

        try:

            microphones = sc.all_microphones(
                include_loopback=False
            )

            for device in microphones:

                sources.append({
                    "type": "microphones",
                    "name": device.name,
                    "device": device,
                })

                print(
                    f"[DISCOVERY] Microphone: {device.name}"
                )

        except Exception as error:

            print(
                f"[DISCOVERY ERROR] Microphones: {error}"
            )

    # --------------------------------------------------------
    # System audio
    # --------------------------------------------------------

    if CONFIG["ENABLE_SYSTEM_AUDIO"]:

        if PLATFORM == "Darwin":

            print(
                "[CAPABILITY] SoundCard does not provide "
                "native macOS loopback capture."
            )

            print(
                "[CAPABILITY] System audio capture skipped."
            )

        else:

            try:

                devices = sc.all_microphones(
                    include_loopback=True
                )

                found_loopback = set()

                for device in devices:

                    if not getattr(
                        device,
                        "isloopback",
                        False
                    ):
                        continue

                    device_id = str(
                        getattr(
                            device,
                            "id",
                            device.name
                        )
                    )

                    if device_id in found_loopback:
                        continue

                    found_loopback.add(device_id)

                    sources.append({
                        "type": "system_audio",
                        "name": device.name,
                        "device": device,
                    })

                    print(
                        f"[DISCOVERY] System audio: {device.name}"
                    )

                if not found_loopback:

                    print(
                        "[CAPABILITY] No loopback devices "
                        "were exposed by the audio backend."
                    )

            except Exception as error:

                print(
                    f"[DISCOVERY ERROR] System audio: {error}"
                )

    return sources


# ============================================================
# DEVICE AUDIO WORKER
# ============================================================

class AudioWorker:

    def __init__(self, source):

        self.source = source

        self.path = create_output(
            source["type"],
            source["name"]
        )

        self.buffer = queue.Queue(
            maxsize=CONFIG["QUEUE_SIZE"]
        )

        self.active = False
        self.error = None

        self.dropped = 0
        self.blocks_captured = 0
        self.frames_written = 0

        self.channels = None

        self.peak = 0.0
        self.rms = 0.0

        self.silence_seconds = 0.0
        self.last_audio_time = None

        self.started_at = None
        self.finished_at = None

        self.capture_thread = threading.Thread(
            target=self.capture,
            daemon=True,
            name=f"Capture-{safe_name(source['name'])}"
        )

        self.writer_thread = threading.Thread(
            target=self.writer,
            daemon=True,
            name=f"Writer-{safe_name(source['name'])}"
        )

    def start(self):

        self.started_at = time.time()
        self.active = True

        self.writer_thread.start()
        self.capture_thread.start()

    def capture(self):

        rate = CONFIG["SAMPLE_RATE"]

        block_frames = int(
            rate * CONFIG["BLOCK_SECONDS"]
        )

        try:

            print(
                f"[CAPTURE] Opening: {self.source['name']}"
            )

            # Do not force a channel count.
            # Let the audio backend select its native channels.

            recorder = self.source["device"].recorder(
                samplerate=rate,
                blocksize=block_frames
            )

            with recorder:

                print(
                    f"[CAPTURE] Started: {self.source['name']}"
                )

                while not STOP_EVENT.is_set():

                    audio = recorder.record(
                        numframes=block_frames
                    )

                    if audio is None or len(audio) == 0:
                        continue

                    audio = np.asarray(
                        audio,
                        dtype=np.float32
                    )

                    if audio.ndim == 1:
                        audio = audio.reshape(-1, 1)

                    self.blocks_captured += 1

                    peak, rms = analyze_audio(audio)

                    self.peak = peak
                    self.rms = rms

                    if rms < CONFIG["SILENCE_THRESHOLD"]:

                        self.silence_seconds += (
                            len(audio) / rate
                        )

                    else:

                        self.silence_seconds = 0.0
                        self.last_audio_time = time.time()

                    try:

                        self.buffer.put_nowait(audio)

                    except queue.Full:

                        self.dropped += 1

        except Exception as error:

            self.error = (
                f"Capture error: {error}"
            )

        finally:

            self.active = False
            self.finished_at = time.time()

            # Ensure the writer receives its stop marker.
            while True:

                try:

                    self.buffer.put(
                        None,
                        timeout=0.5
                    )

                    break

                except queue.Full:
                    continue

    def writer(self):

        try:

            wav = None

            while True:

                try:

                    audio = self.buffer.get(
                        timeout=0.5
                    )

                except queue.Empty:

                    if (
                        STOP_EVENT.is_set()
                        and not self.capture_thread.is_alive()
                    ):
                        break

                    continue

                if audio is None:
                    break

                if wav is None:

                    self.channels = audio.shape[1]

                    wav = wave.open(
                        str(self.path),
                        "wb"
                    )

                    wav.setnchannels(
                        self.channels
                    )

                    wav.setsampwidth(2)

                    wav.setframerate(
                        CONFIG["SAMPLE_RATE"]
                    )

                    print(
                        f"[WRITER] WAV initialized: "
                        f"{self.source['name']} "
                        f"({self.channels} channels)"
                    )

                pcm = (
                    np.clip(
                        np.nan_to_num(audio),
                        -1.0,
                        1.0
                    ) * 32767
                ).astype("<i2")

                wav.writeframesraw(
                    pcm.tobytes()
                )

                self.frames_written += len(audio)

            if wav is not None:
                wav.close()

        except Exception as error:

            self.error = (
                f"Writer error: {error}"
            )

            if wav is not None:

                try:
                    wav.close()

                except Exception:
                    pass

    def join(self):

        self.capture_thread.join()
        self.writer_thread.join()

    def status(self):

        info = file_info(self.path)

        if self.error:
            state = "ERROR"

        elif not self.active:
            state = "STOPPED"

        elif self.rms < CONFIG["SILENCE_THRESHOLD"]:
            state = "SILENT"

        else:
            state = "REC"

        return {
            "source": self.source["name"],
            "type": self.source["type"],

            "status": state,

            "blocks": self.blocks_captured,
            "frames": self.frames_written,

            "dropped": self.dropped,

            "channels": self.channels,

            "peak": self.peak,
            "rms": self.rms,

            "silence_seconds": self.silence_seconds,

            "file_size": info["size"],
            "file_exists": info["exists"],

            "error": self.error,
            "file": str(self.path)
        }


# ============================================================
# APPLICATION CAPTURE WORKER
# ============================================================

class ApplicationWorker:

    def __init__(self, process):

        self.pid = int(process.pid)

        self.name = str(
            getattr(process, "name", "unknown")
        )

        self.window_title = str(
            getattr(process, "window_title", "")
        )

        self.path = create_output(
            "applications",
            f"{self.name}_{self.pid}"
        )

        self.stop_event = threading.Event()

        self.active = False
        self.error = None

        self.capture = None

        self.last_file_size = 0
        self.last_file_growth = time.time()

        self.thread = threading.Thread(
            target=self.run,
            daemon=True,
            name=f"Application-{self.pid}"
        )

    def process_alive(self):

        try:
            return psutil.pid_exists(self.pid)

        except Exception:
            return False

    def start(self):
        self.thread.start()

    def run(self):

        started = False

        try:

            print(
                f"[APP] Initializing {self.name} "
                f"(PID {self.pid})"
            )

            self.capture = PROCESS_AUDIO_CAPTURE(
                pid=self.pid,
                output_path=str(self.path)
            )

            self.capture.start()

            started = True
            self.active = True

            print(
                f"[APP] Recording: {self.name} "
                f"(PID {self.pid})"
            )

            while (
                not STOP_EVENT.is_set()
                and not self.stop_event.is_set()
                and self.process_alive()
            ):

                self.stop_event.wait(0.5)

        except Exception as error:

            self.error = str(error)

        finally:

            self.active = False

            if started and self.capture is not None:

                try:

                    self.capture.stop()

                except Exception as error:

                    if not self.error:
                        self.error = str(error)

            print(
                f"[APP] Stopped: {self.name} "
                f"(PID {self.pid})"
            )

    def stop(self):
        self.stop_event.set()

    def join(self):
        self.thread.join()

    def status(self):

        info = file_info(self.path)

        current_time = time.time()

        if info["size"] > self.last_file_size:

            self.last_file_size = info["size"]
            self.last_file_growth = current_time

        growth_age = (
            current_time - self.last_file_growth
        )

        if not info["exists"]:

            file_state = "NO FILE"

        elif not self.active:

            file_state = "STOPPED"

        elif growth_age > 15:

            file_state = "NO RECENT GROWTH"

        else:

            file_state = "FILE PRESENT"

        if self.error:
            state = "ERROR"

        elif self.active:
            state = "REC"

        else:
            state = "STOPPED"

        return {
            "source": self.name,
            "type": "application",

            "pid": self.pid,
            "window": self.window_title,

            "status": state,
            "file_state": file_state,

            "file_size": info["size"],

            "error": self.error,
            "file": str(self.path)
        }


# ============================================================
# APPLICATION DISCOVERY
# ============================================================

def application_manager():

    if not APP_BACKEND_SUPPORTED:

        print(
            f"[APP] Application capture unavailable: "
            f"{APP_BACKEND_ERROR}"
        )

        return

    print(
        "[APP] Application discovery started."
    )

    while not STOP_EVENT.is_set():

        try:

            processes = (
                PROCESS_AUDIO_CAPTURE.enumerate_audio_processes()
            )

            for process in processes:

                if STOP_EVENT.is_set():
                    break

                pid = int(process.pid)

                if pid <= 0:
                    continue

                if (
                    CONFIG["EXCLUDE_SELF_PROCESS"]
                    and pid == os.getpid()
                ):
                    continue

                if not psutil.pid_exists(pid):
                    continue

                with APP_LOCK:

                    if pid in APP_WORKERS:
                        continue

                    worker = ApplicationWorker(
                        process
                    )

                    APP_WORKERS[pid] = worker

                    worker.start()

        except Exception as error:

            print(
                f"[APP] Discovery error: {error}"
            )

        STOP_EVENT.wait(
            CONFIG["APP_SCAN_INTERVAL"]
        )

    with APP_LOCK:

        workers = list(
            APP_WORKERS.values()
        )

    for worker in workers:
        worker.stop()

    for worker in workers:
        worker.join()

    print(
        "[APP] Application discovery stopped."
    )


# ============================================================
# STATUS COLLECTION
# ============================================================

def get_all_statuses():

    statuses = [
        worker.status()
        for worker in WORKERS
    ]

    with APP_LOCK:

        app_workers = list(
            APP_WORKERS.values()
        )

    statuses.extend(
        worker.status()
        for worker in app_workers
    )

    return statuses


# ============================================================
# CONSOLE DASHBOARD
# ============================================================

def dashboard():

    os.system("cls" if PLATFORM == "Windows" else "clear")

    statuses = get_all_statuses()

    devices = [
        item for item in statuses
        if item["type"] != "application"
    ]

    applications = [
        item for item in statuses
        if item["type"] == "application"
    ]

    active = sum(
        item["status"] == "REC"
        for item in statuses
    )

    silent = sum(
        item["status"] == "SILENT"
        for item in statuses
    )

    errors = sum(
        item["status"] == "ERROR"
        for item in statuses
    )

    dropped = sum(
        item.get("dropped", 0)
        for item in statuses
    )

    storage = sum(
        item.get("file_size", 0)
        for item in statuses
    )

    uptime = format_duration(
        time.time() - START_TIME
    )

    print("=" * 78)
    print("                    QUIETRECORDER ENGINE")
    print("               CROSS-PLATFORM CORE V4.0")
    print("=" * 78)

    print(f" SESSION ID       : {SESSION_ID}")
    print(f" PLATFORM         : {PLATFORM}")
    print(f" OS RELEASE       : {platform.release()}")
    print(f" ARCHITECTURE     : {platform.machine()}")
    print(f" PYTHON           : {platform.python_version()}")
    print(f" UPTIME           : {uptime}")

    print("-" * 78)
    print(" RECORDING OVERVIEW")
    print("-" * 78)

    print(f" Total Sources    : {len(statuses)}")
    print(f" Active           : {active}")
    print(f" Silent           : {silent}")
    print(f" Errors           : {errors}")
    print(f" Dropped Blocks   : {dropped}")
    print(f" Current Storage  : {format_bytes(storage)}")

    print("\n DEVICE CAPTURE")
    print("-" * 78)

    for item in devices:

        print(
            f" [{item['status']:<7}] {item['source']}"
        )

        print(
            f"           Type       : {item['type']}"
        )

        print(
            f"           Audio Level: {rms_to_db(item['rms'])}"
        )

        print(
            f"           Peak       : {item['peak']:.6f}"
        )

        print(
            f"           Channels   : {item['channels']}"
        )

        print(
            f"           Duration   : "
            f"{format_duration(item['frames'] / CONFIG['SAMPLE_RATE'])}"
        )

        print(
            f"           File Size  : "
            f"{format_bytes(item['file_size'])}"
        )

        print(
            f"           Blocks     : {item['blocks']}"
        )

        print(
            f"           Dropped    : {item['dropped']}"
        )

        if (
            item["silence_seconds"]
            >= CONFIG["SILENCE_WARNING_SECONDS"]
        ):

            print(
                f"           WARNING    : "
                f"No significant audio for "
                f"{item['silence_seconds']:.1f}s"
            )

        if item["error"]:

            print(
                f"           ERROR      : {item['error']}"
            )

        print(
            f"           Output     : {item['file']}"
        )

    print("\n APPLICATION CAPTURE")
    print("-" * 78)

    if PLATFORM != "Windows":

        print(
            "[UNAVAILABLE] Installed application backend "
            "is Windows-specific."
        )

    elif not APP_BACKEND_AVAILABLE:

        print(
            f"[UNAVAILABLE] {APP_BACKEND_ERROR}"
        )

    elif not APP_BACKEND_SUPPORTED:

        print(
            f"[UNSUPPORTED] {APP_BACKEND_ERROR}"
        )

    elif not applications:

        print(
            "[SCANNING] No audio-producing applications detected."
        )

    for item in applications:

        print(
            f" [{item['status']:<7}] {item['source']}"
        )

        print(
            f"           PID        : {item['pid']}"
        )

        print(
            f"           File Size  : "
            f"{format_bytes(item['file_size'])}"
        )

        print(
            f"           File Check : {item['file_state']}"
        )

        if item["error"]:

            print(
                f"           ERROR      : {item['error']}"
            )

        print(
            f"           Output     : {item['file']}"
        )

    print("\n SYSTEM DIAGNOSTICS")
    print("-" * 78)

    try:

        process = psutil.Process()

        print(
            f" Memory Usage     : "
            f"{process.memory_info().rss / 1024**2:.2f} MB"
        )

        print(
            f" CPU Usage        : "
            f"{process.cpu_percent(interval=None):.1f}%"
        )

        print(
            f" Thread Count     : {process.num_threads()}"
        )

    except Exception as error:

        print(
            f" Metrics unavailable: {error}"
        )

    print("\n OUTPUT")
    print("-" * 78)

    print(
        f" Session Folder   : {SESSION_DIR.resolve()}"
    )

    print(
        f" Manifest         : {SESSION_DIR / 'manifest.json'}"
    )

    print("\n CONTROL")
    print("-" * 78)

    print(
        " [CTRL+C] Stop recording and validate files."
    )

    print("=" * 78)


# ============================================================
# WAV FORMAT PARSER
# ============================================================

def parse_wav_header(path):

    with open(path, "rb") as file:

        header = file.read(12)

        if len(header) != 12:
            raise ValueError("Incomplete RIFF header.")

        riff_id, riff_size, wave_id = struct.unpack(
            "<4sI4s",
            header
        )

        if riff_id not in (b"RIFF", b"RF64"):
            raise ValueError("Invalid RIFF header.")

        if wave_id != b"WAVE":
            raise ValueError("Invalid WAVE signature.")

        fmt = None
        data_offset = None
        data_size = None

        file_size = os.path.getsize(path)

        while file.tell() + 8 <= file_size:

            chunk_header = file.read(8)

            if len(chunk_header) != 8:
                break

            chunk_id, chunk_size = struct.unpack(
                "<4sI",
                chunk_header
            )

            chunk_offset = file.tell()

            if chunk_id == b"fmt ":

                chunk = file.read(
                    min(chunk_size, 4096)
                )

                if len(chunk) < 16:
                    raise ValueError("Incomplete fmt chunk.")

                (
                    format_tag,
                    channels,
                    sample_rate,
                    byte_rate,
                    block_align,
                    bits
                ) = struct.unpack(
                    "<HHIIHH",
                    chunk[:16]
                )

                valid_bits = bits

                if format_tag == 0xFFFE:

                    if len(chunk) < 40:
                        raise ValueError(
                            "Incomplete extensible WAV format."
                        )

                    cb_size = struct.unpack(
                        "<H",
                        chunk[16:18]
                    )[0]

                    if cb_size < 22:
                        raise ValueError(
                            "Invalid extensible format."
                        )

                    valid_bits = struct.unpack(
                        "<H",
                        chunk[18:20]
                    )[0]

                    guid = chunk[24:40]

                    if guid == bytes.fromhex(
                        "0100000000001000800000aa00389b71"
                    ):

                        format_tag = 1

                    elif guid == bytes.fromhex(
                        "0300000000001000800000aa00389b71"
                    ):

                        format_tag = 3

                    else:

                        raise ValueError(
                            f"Unsupported subformat GUID: {guid.hex()}"
                        )

                if format_tag not in (1, 3):

                    raise ValueError(
                        f"Unsupported WAV format: {format_tag}"
                    )

                fmt = {
                    "format_tag": format_tag,
                    "format_name": (
                        "PCM INTEGER"
                        if format_tag == 1
                        else "IEEE FLOAT"
                    ),
                    "channels": channels,
                    "sample_rate": sample_rate,
                    "block_align": block_align,
                    "bits_per_sample": bits,
                    "valid_bits": valid_bits,
                }

            elif chunk_id == b"data":

                data_offset = chunk_offset
                data_size = chunk_size
                break

            file.seek(
                chunk_offset
                + chunk_size
                + (chunk_size % 2)
            )

        if fmt is None or data_offset is None:
            raise ValueError("Missing WAV format or data chunk.")

        bytes_per_sample = fmt["bits_per_sample"] // 8

        expected_align = (
            fmt["channels"] * bytes_per_sample
        )

        if (
            fmt["channels"] <= 0
            or fmt["sample_rate"] <= 0
            or bytes_per_sample <= 0
            or fmt["block_align"] != expected_align
        ):

            raise ValueError("Invalid WAV stream parameters.")

        available = max(
            0,
            file_size - data_offset
        )

        actual_size = min(
            data_size,
            available
        )

        actual_size -= (
            actual_size % fmt["block_align"]
        )

        fmt.update({
            "data_offset": data_offset,
            "declared_data_size": data_size,
            "actual_data_size": actual_size,
            "truncated": actual_size < data_size,
        })

        return fmt


# ============================================================
# WAV DECODER
# ============================================================

def decode_audio_chunk(raw, fmt):

    bits = fmt["bits_per_sample"]
    tag = fmt["format_tag"]

    if tag == 3:

        if bits == 32:

            samples = np.frombuffer(
                raw,
                dtype="<f4"
            )

        elif bits == 64:

            samples = np.frombuffer(
                raw,
                dtype="<f8"
            )

        else:

            raise ValueError(
                f"Unsupported float bit depth: {bits}"
            )

        return np.nan_to_num(
            samples.astype(np.float64)
        )

    if tag == 1:

        if bits == 8:

            samples = np.frombuffer(
                raw,
                dtype=np.uint8
            ).astype(np.float64)

            return (
                samples - 128.0
            ) / 128.0

        if bits == 16:

            samples = np.frombuffer(
                raw,
                dtype="<i2"
            ).astype(np.float64)

            return samples / 32768.0

        if bits == 24:

            data = np.frombuffer(
                raw,
                dtype=np.uint8
            )

            usable = len(data) - len(data) % 3

            data = data[:usable].reshape(-1, 3)

            values = (
                data[:, 0].astype(np.int32)
                | (data[:, 1].astype(np.int32) << 8)
                | (data[:, 2].astype(np.int32) << 16)
            )

            values = (
                values ^ 0x800000
            ) - 0x800000

            return (
                values.astype(np.float64)
                / 8388608.0
            )

        if bits == 32:

            samples = np.frombuffer(
                raw,
                dtype="<i4"
            ).astype(np.float64)

            return samples / 2147483648.0

    raise ValueError(
        f"Unsupported encoding: {tag}, {bits} bits"
    )


# ============================================================
# WAV VALIDATION
# ============================================================

def validate_wav(path):

    result = {
        "path": str(path),

        "exists": False,
        "valid": False,
        "state": "MISSING",

        "size": 0,

        "format": None,
        "channels": None,
        "sample_rate": None,
        "bits_per_sample": None,

        "frames": 0,
        "duration": 0.0,

        "peak": 0.0,
        "rms": 0.0,

        "sha256": None,
        "truncated": False,

        "error": None,
    }

    try:

        if not path.exists():
            return result

        result["exists"] = True
        result["size"] = path.stat().st_size

        if result["size"] < 44:

            result["state"] = "INCOMPLETE"
            return result

        fmt = parse_wav_header(path)

        block_align = fmt["block_align"]

        frames = (
            fmt["actual_data_size"] // block_align
        )

        result.update({
            "format": fmt["format_name"],
            "channels": fmt["channels"],
            "sample_rate": fmt["sample_rate"],
            "bits_per_sample": fmt["bits_per_sample"],
            "frames": frames,
            "duration": frames / fmt["sample_rate"],
            "truncated": fmt["truncated"],
        })

        if frames <= 0:

            result["state"] = "NO AUDIO"
            return result

        digest = hashlib.sha256()

        total_samples = 0
        total_square = 0.0
        overall_peak = 0.0

        chunk_frames = CONFIG["VALIDATION_CHUNK_FRAMES"]

        with open(path, "rb") as file:

            file.seek(fmt["data_offset"])

            remaining = fmt["actual_data_size"]

            while remaining > 0:

                requested = min(
                    remaining,
                    chunk_frames * block_align
                )

                requested -= (
                    requested % block_align
                )

                if requested <= 0:
                    break

                raw = file.read(requested)

                if not raw:
                    break

                usable = len(raw) - (
                    len(raw) % block_align
                )

                raw = raw[:usable]

                digest.update(raw)

                samples = decode_audio_chunk(
                    raw,
                    fmt
                )

                if samples.size:

                    peak = float(
                        np.max(np.abs(samples))
                    )

                    total_square += float(
                        np.sum(samples ** 2)
                    )

                    total_samples += samples.size

                    overall_peak = max(
                        overall_peak,
                        peak
                    )

                remaining -= usable

        if total_samples == 0:

            result["state"] = "NO DECODABLE AUDIO"
            return result

        rms = np.sqrt(
            total_square / total_samples
        )

        result["peak"] = overall_peak
        result["rms"] = float(rms)

        result["sha256"] = digest.hexdigest()

        if fmt["truncated"]:

            result["state"] = "TRUNCATED"

        elif overall_peak < CONFIG["SILENCE_THRESHOLD"]:

            result["state"] = "SILENT"

        else:

            result["state"] = "VALID"

        result["valid"] = not fmt["truncated"]

    except Exception as error:

        result["state"] = "INVALID"
        result["error"] = str(error)

    return result


# ============================================================
# APPLICATION RECORDING COMPARISON
# ============================================================

def compare_application_audio(results):

    applications = [
        item for item in results
        if (
            "applications" in Path(item["path"]).parts
            and item["valid"]
            and item["sha256"]
        )
    ]

    comparisons = []

    for index, first in enumerate(applications):

        for second in applications[index + 1:]:

            identical = (
                first["sha256"] == second["sha256"]
            )

            comparisons.append({
                "first_file": first["path"],
                "second_file": second["path"],
                "identical_audio_data": identical,
            })

            if identical:

                print(
                    "[INTEGRITY WARNING] "
                    "Identical application audio data detected."
                )

            else:

                print(
                    "[INTEGRITY] Application recordings differ."
                )

    return comparisons


# ============================================================
# SESSION VALIDATION
# ============================================================

def validate_session():

    print(
        "\n[VALIDATION] Starting WAV integrity validation."
    )

    paths = [
        worker.path
        for worker in WORKERS
    ]

    with APP_LOCK:

        paths.extend(
            worker.path
            for worker in APP_WORKERS.values()
        )

    results = []

    for path in paths:

        print(
            f"\n[VALIDATION] Checking: {path}"
        )

        result = validate_wav(path)

        results.append(result)

        print(
            f"[VALIDATION] Result: {result['state']}"
        )

        if result["exists"]:

            print(
                f"              Size      : "
                f"{format_bytes(result['size'])}"
            )

        if result["valid"]:

            print(
                f"              Format    : {result['format']}"
            )

            print(
                f"              SampleRate: "
                f"{result['sample_rate']} Hz"
            )

            print(
                f"              Channels  : {result['channels']}"
            )

            print(
                f"              Bit Depth : "
                f"{result['bits_per_sample']}"
            )

            print(
                f"              Duration  : "
                f"{format_duration(result['duration'])}"
            )

            print(
                f"              Peak      : "
                f"{result['peak']:.6f}"
            )

            print(
                f"              RMS       : "
                f"{result['rms']:.6f}"
            )

            print(
                f"              SHA-256   : "
                f"{result['sha256'][:24]}..."
            )

        elif result["error"]:

            print(
                f"              Error     : {result['error']}"
            )

    print(
        "\n[INTEGRITY] Comparing application recordings..."
    )

    comparisons = compare_application_audio(results)

    valid = sum(
        item["valid"]
        for item in results
    )

    silent = sum(
        item["state"] == "SILENT"
        for item in results
    )

    invalid = sum(
        not item["valid"]
        for item in results
    )

    truncated = sum(
        item["state"] == "TRUNCATED"
        for item in results
    )

    print("\n[VALIDATION] SUMMARY")
    print("-" * 60)

    print(f" Total Files    : {len(results)}")
    print(f" Valid Files    : {valid}")
    print(f" Silent Files   : {silent}")
    print(f" Invalid Files  : {invalid}")
    print(f" Truncated      : {truncated}")
    print(f" Comparisons    : {len(comparisons)}")

    return results, comparisons


# ============================================================
# SESSION MANIFEST
# ============================================================

def save_manifest(results, comparisons):

    manifest = {
        "engine": "QuietRecorder",
        "version": "4.0",

        "session_id": SESSION_ID,

        "started_at": SESSION_ID,
        "ended_at": datetime.now().isoformat(),

        "duration_seconds": (
            time.time() - START_TIME
        ),

        "platform": detect_platform(),

        "capabilities": {
            "device_audio": True,
            "system_audio": (
                PLATFORM != "Darwin"
            ),
            "application_audio": (
                APP_BACKEND_SUPPORTED
            ),
            "application_backend_available": (
                APP_BACKEND_AVAILABLE
            ),
            "application_backend_error": (
                APP_BACKEND_ERROR
            ),
        },

        "configuration": CONFIG,

        "sources": get_all_statuses(),

        "validation": results,

        "application_audio_comparisons": comparisons,

        "summary": {
            "total_files": len(results),

            "valid_files": sum(
                item["valid"]
                for item in results
            ),

            "silent_files": sum(
                item["state"] == "SILENT"
                for item in results
            ),

            "invalid_files": sum(
                not item["valid"]
                for item in results
            ),

            "truncated_files": sum(
                item["state"] == "TRUNCATED"
                for item in results
            ),
        }
    }

    path = SESSION_DIR / "manifest.json"

    with open(
        path,
        "w",
        encoding="utf-8"
    ) as file:

        json.dump(
            manifest,
            file,
            indent=4
        )

    print(
        f"[MANIFEST] Saved: {path}"
    )


# ============================================================
# MAIN ENGINE
# ============================================================

def main():

    SESSION_DIR.mkdir(
        parents=True,
        exist_ok=True
    )

    print("=" * 78)
    print("                    QUIETRECORDER ENGINE")
    print("                  CROSS-PLATFORM V4.0")
    print("=" * 78)

    print(
        f"[INIT] Platform: {PLATFORM}"
    )

    print(
        f"[INIT] Release: {platform.release()}"
    )

    print(
        f"[INIT] Architecture: {platform.machine()}"
    )

    print(
        f"[INIT] Python: {platform.python_version()}"
    )

    print(
        f"[INIT] Session: {SESSION_ID}"
    )

    print(
        "[INIT] Initializing optional application backend..."
    )

    initialize_application_backend()

    if APP_BACKEND_SUPPORTED:

        print(
            "[CAPABILITY] Application capture available."
        )

    else:

        print(
            f"[CAPABILITY] Application capture unavailable: "
            f"{APP_BACKEND_ERROR}"
        )

    print(
        "[INIT] Discovering audio devices..."
    )

    sources = discover_sources()

    print(
        f"[INIT] Discovered {len(sources)} audio sources."
    )

    # Test microphone access before starting any recording workers.
    # System-audio loopback sources are not microphone permission checks.
    authorized_sources = []

    for source in sources:

        if source["type"] == "microphones":

            permission = check_microphone_access(source["device"])
            source["permission"] = permission

            if permission != "GRANTED":

                print(
                    f"[SKIPPED] Microphone unavailable: "
                    f"{source['name']} ({permission})"
                )

                continue

        authorized_sources.append(source)

    sources = authorized_sources

    microphone_count = sum(
        source["type"] == "microphones"
        for source in sources
    )

    system_audio_count = sum(
        source["type"] == "system_audio"
        for source in sources
    )

    print(
        f"[PERMISSION] Microphones authorized: {microphone_count}"
    )

    print(
        f"[INIT] System audio sources available: {system_audio_count}"
    )

    print(
        f"[INIT] Sources proceeding to recording: {len(sources)}"
    )

    for source in sources:

        worker = AudioWorker(source)

        WORKERS.append(worker)

        worker.start()

    app_thread = None

    if APP_BACKEND_SUPPORTED:

        app_thread = threading.Thread(
            target=application_manager,
            daemon=True,
            name="ApplicationDiscovery"
        )

        app_thread.start()

    print(
        "[INIT] Recording engine initialized."
    )

    print(
        "[INIT] Dashboard started."
    )

    try:

        while not STOP_EVENT.is_set():

            dashboard()

            STOP_EVENT.wait(
                CONFIG["DASHBOARD_REFRESH"]
            )

    except KeyboardInterrupt:

        print(
            "\n[SHUTDOWN] Keyboard interrupt received."
        )

        STOP_EVENT.set()

    finally:

        STOP_EVENT.set()

        print(
            "\n[SHUTDOWN] Stopping device workers..."
        )

        for worker in WORKERS:
            worker.join()

        if app_thread is not None:

            print(
                "[SHUTDOWN] Waiting for application backend..."
            )

            app_thread.join()

        print(
            "[SHUTDOWN] Capture workers stopped."
        )

        print(
            "[SHUTDOWN] Validating recordings..."
        )

        results, comparisons = validate_session()

        print(
            "\n[SHUTDOWN] Writing manifest..."
        )

        save_manifest(
            results,
            comparisons
        )

        print("\n" + "=" * 78)
        print("                    SESSION COMPLETED")
        print("=" * 78)

        print(
            f" Platform       : {PLATFORM}"
        )

        print(
            f" Session Folder : {SESSION_DIR.resolve()}"
        )

        print(
            f" Total Files    : {len(results)}"
        )

        print(
            f" Valid Files    : "
            f"{sum(item['valid'] for item in results)}"
        )

        print(
            f" Silent Files   : "
            f"{sum(item['state'] == 'SILENT' for item in results)}"
        )

        print(
            f" Invalid Files  : "
            f"{sum(not item['valid'] for item in results)}"
        )

        print("=" * 78)


if __name__ == "__main__":

    try:
        main()

    except Exception as error:

        print(
            f"\n[FATAL] QuietRecorder terminated: {error}"
        )

        raise