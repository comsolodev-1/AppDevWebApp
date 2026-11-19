
"""
BACKGROUND APPLICATION CAPTURE ENGINE — VERSION 2
==================================================

Purpose:
    Track and capture background application windows on the
    SAME Windows Virtual Desktop without activating them.

Example:
    Foreground: VS Code
    Background: Chrome, Edge, Canva

FEATURES:
    1. Automatically detects newly opened windows.
    2. Automatically detects closed windows.
    3. Tracks each window independently.
    4. Tracks title changes without creating duplicate sessions.
    5. Identifies the application process and executable.
    6. Captures background windows without activating them.
    7. Pauses capture when a tracked window becomes foreground.
    8. Resumes capture when it goes into the background.
    9. Detects minimized windows.
   10. Saves separate PNG sequences for every tracked window.
   11. Creates a separate MP4 for every tracked window.
   12. Maintains an event log and capture history.

INSTALL:
    python -m pip install pywin32 comtypes Pillow

OPTIONAL:
    Install FFmpeg and add it to PATH for MP4 encoding.

RUN:
    python main.py

STOP:
    CTRL + C
"""

import ctypes
import csv
import logging
import shutil
import subprocess
import time
import re

from pathlib import Path
from datetime import datetime

import comtypes
from comtypes import GUID, COMMETHOD, HRESULT, IUnknown
from ctypes import POINTER
from ctypes.wintypes import BOOL, HWND, DWORD, HANDLE

import win32gui
import win32ui
import win32con
import win32process

from PIL import Image


# ============================================================
# CONFIGURATION
# ============================================================

INTERVAL_SECONDS = 5

# None = unlimited recording.
DURATION_SECONDS = 180

OUTPUT_DIR = Path("background_capture_v2")

CREATE_MP4 = True
VIDEO_FPS = 1

SAVE_SCREENSHOTS = True

# Capture minimized windows?
# Usually not recommended because PrintWindow may return blank frames.
CAPTURE_MINIMIZED = False

MIN_WINDOW_WIDTH = 80
MIN_WINDOW_HEIGHT = 60

PRINT_WINDOW_FLAGS = (2, 0)

EXCLUDE_TOOL_WINDOWS = True

# Keep the engine attached to the virtual desktop on which
# it started. Switching desktops will not change its target.
LOCK_TO_STARTING_DESKTOP = True

# ============================================================
# WINDOWS API
# ============================================================

PROCESS_QUERY_LIMITED_INFORMATION = 0x1000

kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)

kernel32.OpenProcess.argtypes = [
    DWORD,
    BOOL,
    DWORD
]
kernel32.OpenProcess.restype = HANDLE

kernel32.QueryFullProcessImageNameW.argtypes = [
    HANDLE,
    DWORD,
    ctypes.c_wchar_p,
    POINTER(DWORD)
]
kernel32.QueryFullProcessImageNameW.restype = BOOL

kernel32.CloseHandle.argtypes = [HANDLE]
kernel32.CloseHandle.restype = BOOL


# ============================================================
# VIRTUAL DESKTOP COM INTERFACE
# ============================================================

CLSID_VIRTUAL_DESKTOP_MANAGER = GUID(
    "{AA509086-5CA9-4C25-8F95-589D3C07B48A}"
)

IID_VIRTUAL_DESKTOP_MANAGER = GUID(
    "{A5CD92FF-29BE-454C-8D04-D82879FB3F1B}"
)


class IVirtualDesktopManager(IUnknown):

    _iid_ = IID_VIRTUAL_DESKTOP_MANAGER

    _methods_ = [

        COMMETHOD(
            [],
            HRESULT,
            "IsWindowOnCurrentVirtualDesktop",
            (["in"], HWND, "hwnd"),
            (["out", "retval"], POINTER(BOOL), "result"),
        ),

        COMMETHOD(
            [],
            HRESULT,
            "GetWindowDesktopId",
            (["in"], HWND, "hwnd"),
            (["out", "retval"], POINTER(GUID), "desktopId"),
        ),

        COMMETHOD(
            [],
            HRESULT,
            "MoveWindowToDesktop",
            (["in"], HWND, "hwnd"),
            (["in"], POINTER(GUID), "desktopId"),
        ),

    ]


def create_desktop_manager():

    return comtypes.CoCreateInstance(
        CLSID_VIRTUAL_DESKTOP_MANAGER,
        interface=IVirtualDesktopManager,
        clsctx=comtypes.CLSCTX_ALL,
    )


def guid_string(guid):

    return str(guid).strip("{}").upper()


# ============================================================
# PROCESS INFORMATION
# ============================================================

def get_process_information(hwnd):

    try:

        thread_id, process_id = (
            win32process.GetWindowThreadProcessId(hwnd)
        )

        process_handle = kernel32.OpenProcess(
            PROCESS_QUERY_LIMITED_INFORMATION,
            False,
            process_id
        )

        executable_path = ""

        if process_handle:

            try:

                buffer = ctypes.create_unicode_buffer(4096)
                buffer_size = DWORD(len(buffer))

                result = kernel32.QueryFullProcessImageNameW(
                    process_handle,
                    0,
                    buffer,
                    ctypes.byref(buffer_size)
                )

                if result:
                    executable_path = buffer.value

            finally:

                kernel32.CloseHandle(process_handle)

        executable_name = (
            Path(executable_path).name
            if executable_path
            else "Unknown"
        )

        return {
            "pid": process_id,
            "process_name": executable_name,
            "executable_path": executable_path,
        }

    except Exception:

        return {
            "pid": 0,
            "process_name": "Unknown",
            "executable_path": "",
        }


# ============================================================
# ACTIVE DESKTOP DETECTION
# ============================================================

def get_current_desktop_id(manager):

    result = {"desktop_id": None}

    def callback(hwnd, _):

        if result["desktop_id"]:
            return

        try:

            if not win32gui.IsWindowVisible(hwnd):
                return

            result["desktop_id"] = guid_string(
                manager.GetWindowDesktopId(hwnd)
            )

        except Exception:
            pass

    win32gui.EnumWindows(callback, None)

    if not result["desktop_id"]:

        raise RuntimeError(
            "Unable to identify current virtual desktop."
        )

    return result["desktop_id"]


# ============================================================
# WINDOW DISCOVERY
# ============================================================

def discover_windows(manager, target_desktop_id):

    windows = []

    foreground_hwnd = win32gui.GetForegroundWindow()

    def callback(hwnd, _):

        try:

            if not win32gui.IsWindow(hwnd):
                return

            if not win32gui.IsWindowVisible(hwnd):
                return

            title = win32gui.GetWindowText(hwnd).strip()

            if not title:
                return

            if EXCLUDE_TOOL_WINDOWS:

                ex_style = win32gui.GetWindowLong(
                    hwnd,
                    win32con.GWL_EXSTYLE
                )

                if ex_style & win32con.WS_EX_TOOLWINDOW:
                    return

            desktop_id = guid_string(
                manager.GetWindowDesktopId(hwnd)
            )

            if desktop_id != target_desktop_id:
                return

            is_minimized = bool(win32gui.IsIconic(hwnd))

            if is_minimized:

                placement = win32gui.GetWindowPlacement(hwnd)

                rect = placement[4]

                left, top, right, bottom = rect

            else:

                left, top, right, bottom = (
                    win32gui.GetWindowRect(hwnd)
                )

            width = right - left
            height = bottom - top

            if width < MIN_WINDOW_WIDTH:
                return

            if height < MIN_WINDOW_HEIGHT:
                return

            process_info = get_process_information(hwnd)

            if process_info["pid"] == 0:
                return

            windows.append({

                "hwnd": hwnd,

                "pid": process_info["pid"],

                "title": title,

                "process_name": process_info["process_name"],

                "executable_path": process_info["executable_path"],

                "desktop_id": desktop_id,

                "left": left,
                "top": top,

                "width": width,
                "height": height,

                "is_minimized": is_minimized,

                "is_foreground": hwnd == foreground_hwnd,

            })

        except Exception as error:

            logging.debug(
                "Discovery skipped HWND %s: %s",
                hwnd,
                error
            )

    win32gui.EnumWindows(callback, None)

    return windows


# ============================================================
# WINDOW TRACKER
# ============================================================

class WindowTracker:

    def __init__(self):

        self.windows = {}

        self.next_id = 1

        self.events_path = OUTPUT_DIR / "window_events.csv"

        self.events_file = self.events_path.open(
            "w",
            newline="",
            encoding="utf-8-sig"
        )

        self.events_writer = csv.DictWriter(
            self.events_file,
            fieldnames=[
                "timestamp",
                "event",
                "tracking_id",
                "hwnd",
                "pid",
                "process_name",
                "window_title",
                "details",
            ]
        )

        self.events_writer.writeheader()
        self.events_file.flush()

    def log_event(
        self,
        event,
        tracker,
        details=""
    ):

        self.events_writer.writerow({

            "timestamp": datetime.now().isoformat(),

            "event": event,

            "tracking_id": tracker["tracking_id"],

            "hwnd": tracker["hwnd"],

            "pid": tracker["pid"],

            "process_name": tracker["process_name"],

            "window_title": tracker["title"],

            "details": details,

        })

        self.events_file.flush()

        logging.info(
            "%s | %s | %s | HWND=%s | PID=%s",
            event,
            tracker["tracking_id"],
            tracker["process_name"],
            tracker["hwnd"],
            tracker["pid"],
        )

    def register_window(self, window):

        tracking_id = f"window_{self.next_id:04d}"

        self.next_id += 1

        directory = (
            OUTPUT_DIR
            / "applications"
            / tracking_id
        )

        directory.mkdir(
            parents=True,
            exist_ok=True
        )

        tracker = {

            **window,

            "tracking_id": tracking_id,

            "directory": directory,

            "first_seen": datetime.now().isoformat(),

            "last_seen": datetime.now().isoformat(),

            "last_title": window["title"],

            "frame_count": 0,

            "capture_success": 0,

            "capture_failed": 0,

            "active": True,

            "last_state": None,

        }

        self.windows[
            (window["hwnd"], window["pid"])
        ] = tracker

        self.log_event(
            "WINDOW_OPENED",
            tracker,
            "New background-capable window discovered."
        )

        return tracker

    def update_window(self, tracker, window):

        old_title = tracker["title"]

        tracker.update({

            "title": window["title"],

            "process_name": window["process_name"],

            "executable_path": window["executable_path"],

            "left": window["left"],

            "top": window["top"],

            "width": window["width"],

            "height": window["height"],

            "is_minimized": window["is_minimized"],

            "is_foreground": window["is_foreground"],

            "last_seen": datetime.now().isoformat(),

        })

        if old_title != window["title"]:

            tracker["last_title"] = window["title"]

            self.log_event(
                "TITLE_CHANGED",
                tracker,
                f"Previous title: {old_title}"
            )

    def synchronize(self, discovered_windows):

        current_keys = set()

        for window in discovered_windows:

            key = (
                window["hwnd"],
                window["pid"]
            )

            current_keys.add(key)

            tracker = self.windows.get(key)

            if tracker is None:

                tracker = self.register_window(window)

            else:

                self.update_window(
                    tracker,
                    window
                )

        # Detect windows that disappeared from the target desktop.
        for key, tracker in list(self.windows.items()):

            if not tracker["active"]:
                continue

            if key not in current_keys:

                hwnd = tracker["hwnd"]

                if win32gui.IsWindow(hwnd):

                    try:

                        _, current_pid = (
                            win32process.GetWindowThreadProcessId(hwnd)
                        )

                    except Exception:

                        current_pid = None

                else:

                    current_pid = None

                if current_pid != tracker["pid"]:

                    event = "WINDOW_CLOSED"

                    details = "Window no longer exists or HWND was reused."

                else:

                    event = "WINDOW_LEFT_TARGET"

                    details = (
                        "Window hidden, moved to another desktop, "
                        "or no longer eligible for tracking."
                    )

                tracker["active"] = False

                tracker["closed_at"] = datetime.now().isoformat()

                self.log_event(
                    event,
                    tracker,
                    details
                )

        return [
            tracker
            for tracker in self.windows.values()
            if tracker["active"]
        ]

    def close(self):

        self.events_file.flush()
        self.events_file.close()


# ============================================================
# BACKGROUND WINDOW CAPTURE
# ============================================================

def capture_window(hwnd):

    if not win32gui.IsWindow(hwnd):

        return None, "", "WINDOW_GONE"

    if win32gui.IsIconic(hwnd) and not CAPTURE_MINIMIZED:

        return None, "", "MINIMIZED"

    hwnd_dc = None
    source_dc = None
    memory_dc = None
    bitmap = None

    try:

        left, top, right, bottom = win32gui.GetWindowRect(hwnd)

        width = right - left
        height = bottom - top

        if width <= 0 or height <= 0:

            return None, "", "INVALID_SIZE"

        hwnd_dc = win32gui.GetWindowDC(hwnd)

        if not hwnd_dc:

            return None, "", "GET_WINDOW_DC_FAILED"

        source_dc = win32ui.CreateDCFromHandle(hwnd_dc)

        memory_dc = source_dc.CreateCompatibleDC()

        bitmap = win32ui.CreateBitmap()

        bitmap.CreateCompatibleBitmap(
            source_dc,
            width,
            height
        )

        memory_dc.SelectObject(bitmap)

        captured = False
        mode = ""

        for flags in (2, 0):

            try:

                result = ctypes.windll.user32.PrintWindow(
                    hwnd,
                    memory_dc.GetSafeHdc(),
                    flags
                )

                if result:

                    captured = True

                    mode = (
                        "FULLCONTENT"
                        if flags == 2
                        else "STANDARD"
                    )

                    break

            except Exception:
                continue

        if not captured:

            return None, "", "PRINTWINDOW_FAILED"

        bits = bitmap.GetBitmapBits(True)

        image = Image.frombytes(
            "RGB",
            (width, height),
            bits,
            "raw",
            "BGRX",
            0,
            1
        ).copy()

        return image, mode, "SUCCESS"

    except Exception as error:

        return (
            None,
            "",
            f"ERROR: {type(error).__name__}: {error}"
        )

    finally:

        if bitmap:

            try:
                bitmap.DeleteObject()
            except Exception:
                pass

        if memory_dc:

            try:
                memory_dc.DeleteDC()
            except Exception:
                pass

        if source_dc:

            try:
                source_dc.DeleteDC()
            except Exception:
                pass

        if hwnd_dc:

            try:
                win32gui.ReleaseDC(hwnd, hwnd_dc)
            except Exception:
                pass


# ============================================================
# PER-WINDOW RECORDING
# ============================================================

def save_capture(tracker, image):

    directory = tracker["directory"]

    filename = (
        f"frame_{tracker['frame_count']:06d}.png"
    )

    if SAVE_SCREENSHOTS:

        image.save(
            directory / filename
        )


# ============================================================
# CAPTURE HISTORY
# ============================================================

class CaptureLogger:

    def __init__(self):

        self.path = OUTPUT_DIR / "capture_log.csv"

        self.file = self.path.open(
            "w",
            newline="",
            encoding="utf-8-sig"
        )

        self.writer = csv.DictWriter(
            self.file,
            fieldnames=[
                "timestamp",
                "iteration",
                "tracking_id",
                "window_title",
                "process_name",
                "pid",
                "hwnd",
                "state",
                "width",
                "height",
                "capture_mode",
                "status",
            ]
        )

        self.writer.writeheader()

    def write(
        self,
        iteration,
        tracker,
        state,
        mode,
        status,
        width=0,
        height=0
    ):

        self.writer.writerow({

            "timestamp": datetime.now().isoformat(),

            "iteration": iteration,

            "tracking_id": tracker["tracking_id"],

            "window_title": tracker["title"],

            "process_name": tracker["process_name"],

            "pid": tracker["pid"],

            "hwnd": tracker["hwnd"],

            "state": state,

            "width": width,

            "height": height,

            "capture_mode": mode,

            "status": status,

        })

        self.file.flush()

    def close(self):

        self.file.flush()
        self.file.close()


# ============================================================
# VIDEO ENCODING
# ============================================================

def encode_videos():

    if not CREATE_MP4:
        return

    ffmpeg = shutil.which("ffmpeg")

    if not ffmpeg:

        logging.warning(
            "FFmpeg not found. PNG recordings are preserved."
        )

        return

    applications_dir = OUTPUT_DIR / "applications"

    if not applications_dir.exists():
        return

    for app_dir in applications_dir.iterdir():

        if not app_dir.is_dir():
            continue

        frames = list(
            app_dir.glob("frame_*.png")
        )

        if not frames:
            continue

        output_file = app_dir / "recording.mp4"

        command = [

            ffmpeg,

            "-y",

            "-hide_banner",

            "-loglevel",
            "error",

            "-framerate",
            str(VIDEO_FPS),

            "-i",
            str(app_dir / "frame_%06d.png"),

            "-c:v",
            "libx264",

            "-pix_fmt",
            "yuv420p",

            "-movflags",
            "+faststart",

            str(output_file),

        ]

        try:

            subprocess.run(
                command,
                check=True
            )

            logging.info(
                "VIDEO CREATED | %s",
                output_file
            )

        except subprocess.CalledProcessError as error:

            logging.error(
                "VIDEO ERROR | %s | %s",
                app_dir.name,
                error
            )


# ============================================================
# MAIN ENGINE
# ============================================================

def main():

    OUTPUT_DIR.mkdir(
        parents=True,
        exist_ok=True
    )

    logging.basicConfig(

        level=logging.INFO,

        format="%(asctime)s | %(levelname)s | %(message)s",

        handlers=[

            logging.StreamHandler(),

            logging.FileHandler(
                OUTPUT_DIR / "engine.log",
                encoding="utf-8"
            ),

        ],
    )

    comtypes.CoInitialize()

    manager = create_desktop_manager()

    target_desktop_id = get_current_desktop_id(manager)

    logging.info("=" * 60)
    logging.info("BACKGROUND APPLICATION CAPTURE ENGINE V2")
    logging.info("=" * 60)

    logging.info(
        "Target desktop: %s",
        target_desktop_id
    )

    logging.info(
        "Interval: %s seconds",
        INTERVAL_SECONDS
    )

    logging.info(
        "Duration: %s",
        DURATION_SECONDS
    )

    logging.info(
        "Output: %s",
        OUTPUT_DIR.resolve()
    )

    tracker = WindowTracker()
    capture_logger = CaptureLogger()

    start_time = time.monotonic()

    iteration = 0

    total_success = 0
    total_failed = 0

    try:

        while True:

            cycle_start = time.monotonic()

            if (

                DURATION_SECONDS is not None

                and cycle_start - start_time
                >= DURATION_SECONDS

            ):

                break

            iteration += 1

            try:

                discovered = discover_windows(
                    manager,
                    target_desktop_id
                )

            except Exception as error:

                logging.exception(
                    "DISCOVERY ERROR: %s",
                    error
                )

                discovered = []

            active_trackers = tracker.synchronize(
                discovered
            )

            foreground_hwnd = win32gui.GetForegroundWindow()

            cycle_success = 0
            cycle_failed = 0
            background_count = 0

            for app in active_trackers:

                hwnd = app["hwnd"]

                # Foreground windows are tracked but not captured.
                if hwnd == foreground_hwnd:

                    state = "FOREGROUND"

                    capture_logger.write(
                        iteration,
                        app,
                        state,
                        "",
                        "SKIPPED_FOREGROUND"
                    )

                    if app["last_state"] != state:

                        tracker.log_event(
                            "FOREGROUND",
                            app,
                            "Capture paused while window is foreground."
                        )

                        app["last_state"] = state

                    continue

                if app["is_minimized"]:

                    state = "MINIMIZED"

                    capture_logger.write(
                        iteration,
                        app,
                        state,
                        "",
                        "MINIMIZED"
                    )

                    if app["last_state"] != state:

                        tracker.log_event(
                            "MINIMIZED",
                            app,
                            "Window is minimized."
                        )

                        app["last_state"] = state

                    continue

                state = "BACKGROUND"

                background_count += 1

                if app["last_state"] != state:

                    tracker.log_event(
                        "BACKGROUND",
                        app,
                        "Window is available for background capture."
                    )

                    app["last_state"] = state

                # Recheck foreground before attempting capture.
                if hwnd == win32gui.GetForegroundWindow():

                    continue

                image, mode, status = capture_window(hwnd)

                if image is not None:

                    app["frame_count"] += 1

                    app["capture_success"] += 1

                    cycle_success += 1
                    total_success += 1

                    width, height = image.size

                    save_capture(
                        app,
                        image
                    )

                else:

                    app["capture_failed"] += 1

                    cycle_failed += 1
                    total_failed += 1

                    width = 0
                    height = 0

                capture_logger.write(
                    iteration,
                    app,
                    state,
                    mode,
                    status,
                    width,
                    height
                )

            logging.info(

                "CYCLE %d | Tracked=%d | Background=%d | "
                "Captured=%d | Failed=%d",

                iteration,

                len(active_trackers),

                background_count,

                cycle_success,

                cycle_failed

            )

            elapsed = time.monotonic() - cycle_start

            time.sleep(
                max(0, INTERVAL_SECONDS - elapsed)
            )

    except KeyboardInterrupt:

        logging.info("STOPPED BY USER.")

    finally:

        logging.info("=" * 60)
        logging.info("ENGINE SHUTDOWN")
        logging.info("=" * 60)

        logging.info(
            "Iterations: %d",
            iteration
        )

        logging.info(
            "Successful captures: %d",
            total_success
        )

        logging.info(
            "Failed captures: %d",
            total_failed
        )

        logging.info(
            "Tracked windows: %d",
            len(tracker.windows)
        )

        for app in tracker.windows.values():

            logging.info(

                "%s | %s | Frames=%d | Success=%d | Failed=%d",

                app["tracking_id"],

                app["process_name"],

                app["frame_count"],

                app["capture_success"],

                app["capture_failed"]

            )

        tracker.close()
        capture_logger.close()

        encode_videos()

        comtypes.CoUninitialize()


if __name__ == "__main__":

    main()
