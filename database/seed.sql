-- Seed data (PostgreSQL): 15 barangays of Talisay, Camarines Norte, 1 Super Admin, 1 Barangay Admin per barangay.
-- The roles table is filled by schema.sql (Super Admin, Barangay Admin, Viewer).
-- Barangay codes below (TAL-01 ...) are placeholders. Replace them with the official codes;
-- every table that points to a barangay uses ON UPDATE CASCADE, so changing a code is safe.
-- Default passwords (change after first login): superadmin = Admin@12345 ; barangay admins = Barangay@123

INSERT INTO users (username,password_hash,first_name,last_name,role_id,account_status,password_changed) VALUES
('superadmin','$2b$11$7WjR3re9sWDM6zYRKRDOi.T29Kr5rRdoaqaaBUrm29g0tzLJVdJlu','DILG','Super Admin',(SELECT role_id FROM roles WHERE role_name = 'Super Admin'),'Active',(NOW() AT TIME ZONE 'Asia/Manila'));

INSERT INTO barangays (barangay_code,barangay_name,municipality,province,status) VALUES
('TAL-01','Binanuaan','Talisay','Camarines Norte','Active'),
('TAL-02','Caawigan','Talisay','Camarines Norte','Active'),
('TAL-03','Cahabaan','Talisay','Camarines Norte','Active'),
('TAL-04','Calintaan','Talisay','Camarines Norte','Active'),
('TAL-05','Del Carmen','Talisay','Camarines Norte','Active'),
('TAL-06','Gabon','Talisay','Camarines Norte','Active'),
('TAL-07','Itomang','Talisay','Camarines Norte','Active'),
('TAL-08','Poblacion','Talisay','Camarines Norte','Active'),
('TAL-09','San Francisco','Talisay','Camarines Norte','Active'),
('TAL-10','San Isidro','Talisay','Camarines Norte','Active'),
('TAL-11','San Jose','Talisay','Camarines Norte','Active'),
('TAL-12','San Nicolas','Talisay','Camarines Norte','Active'),
('TAL-13','Santa Cruz','Talisay','Camarines Norte','Active'),
('TAL-14','Santa Elena','Talisay','Camarines Norte','Active'),
('TAL-15','Santo Niño','Talisay','Camarines Norte','Active');

INSERT INTO users (username,password_hash,first_name,last_name,role_id,barangay_code,account_status,created_by) VALUES
('brgy_binanuaan','$2b$11$mkdU6LTfqVDTPAwkgmI0WeHApugqvE2HCoULN7k65d1d9njYqEucu','Barangay','Binanuaan Admin',(SELECT role_id FROM roles WHERE role_name = 'Barangay Admin'),'TAL-01','Active',1),
('brgy_caawigan','$2b$11$mkdU6LTfqVDTPAwkgmI0WeHApugqvE2HCoULN7k65d1d9njYqEucu','Barangay','Caawigan Admin',(SELECT role_id FROM roles WHERE role_name = 'Barangay Admin'),'TAL-02','Active',1),
('brgy_cahabaan','$2b$11$mkdU6LTfqVDTPAwkgmI0WeHApugqvE2HCoULN7k65d1d9njYqEucu','Barangay','Cahabaan Admin',(SELECT role_id FROM roles WHERE role_name = 'Barangay Admin'),'TAL-03','Active',1),
('brgy_calintaan','$2b$11$mkdU6LTfqVDTPAwkgmI0WeHApugqvE2HCoULN7k65d1d9njYqEucu','Barangay','Calintaan Admin',(SELECT role_id FROM roles WHERE role_name = 'Barangay Admin'),'TAL-04','Active',1),
('brgy_del_carmen','$2b$11$mkdU6LTfqVDTPAwkgmI0WeHApugqvE2HCoULN7k65d1d9njYqEucu','Barangay','Del Carmen Admin',(SELECT role_id FROM roles WHERE role_name = 'Barangay Admin'),'TAL-05','Active',1),
('brgy_gabon','$2b$11$mkdU6LTfqVDTPAwkgmI0WeHApugqvE2HCoULN7k65d1d9njYqEucu','Barangay','Gabon Admin',(SELECT role_id FROM roles WHERE role_name = 'Barangay Admin'),'TAL-06','Active',1),
('brgy_itomang','$2b$11$mkdU6LTfqVDTPAwkgmI0WeHApugqvE2HCoULN7k65d1d9njYqEucu','Barangay','Itomang Admin',(SELECT role_id FROM roles WHERE role_name = 'Barangay Admin'),'TAL-07','Active',1),
('brgy_poblacion','$2b$11$mkdU6LTfqVDTPAwkgmI0WeHApugqvE2HCoULN7k65d1d9njYqEucu','Barangay','Poblacion Admin',(SELECT role_id FROM roles WHERE role_name = 'Barangay Admin'),'TAL-08','Active',1),
('brgy_san_francisco','$2b$11$mkdU6LTfqVDTPAwkgmI0WeHApugqvE2HCoULN7k65d1d9njYqEucu','Barangay','San Francisco Admin',(SELECT role_id FROM roles WHERE role_name = 'Barangay Admin'),'TAL-09','Active',1),
('brgy_san_isidro','$2b$11$mkdU6LTfqVDTPAwkgmI0WeHApugqvE2HCoULN7k65d1d9njYqEucu','Barangay','San Isidro Admin',(SELECT role_id FROM roles WHERE role_name = 'Barangay Admin'),'TAL-10','Active',1),
('brgy_san_jose','$2b$11$mkdU6LTfqVDTPAwkgmI0WeHApugqvE2HCoULN7k65d1d9njYqEucu','Barangay','San Jose Admin',(SELECT role_id FROM roles WHERE role_name = 'Barangay Admin'),'TAL-11','Active',1),
('brgy_san_nicolas','$2b$11$mkdU6LTfqVDTPAwkgmI0WeHApugqvE2HCoULN7k65d1d9njYqEucu','Barangay','San Nicolas Admin',(SELECT role_id FROM roles WHERE role_name = 'Barangay Admin'),'TAL-12','Active',1),
('brgy_santa_cruz','$2b$11$mkdU6LTfqVDTPAwkgmI0WeHApugqvE2HCoULN7k65d1d9njYqEucu','Barangay','Santa Cruz Admin',(SELECT role_id FROM roles WHERE role_name = 'Barangay Admin'),'TAL-13','Active',1),
('brgy_santa_elena','$2b$11$mkdU6LTfqVDTPAwkgmI0WeHApugqvE2HCoULN7k65d1d9njYqEucu','Barangay','Santa Elena Admin',(SELECT role_id FROM roles WHERE role_name = 'Barangay Admin'),'TAL-14','Active',1),
('brgy_santo_nino','$2b$11$mkdU6LTfqVDTPAwkgmI0WeHApugqvE2HCoULN7k65d1d9njYqEucu','Barangay','Santo Niño Admin',(SELECT role_id FROM roles WHERE role_name = 'Barangay Admin'),'TAL-15','Active',1);

UPDATE barangays b SET user_id = u.user_id FROM users u WHERE u.barangay_code = b.barangay_code;
