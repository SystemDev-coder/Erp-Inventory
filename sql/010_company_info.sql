-- Company Info table
CREATE TABLE IF NOT EXISTS ims.company_info (
    company_id INTEGER PRIMARY KEY DEFAULT 1,
    company_name VARCHAR(200) NOT NULL,
    logo_img TEXT,
    banner_img TEXT,
    phone VARCHAR(50),
    manager_name VARCHAR(150),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Ensure singleton row exists
INSERT INTO ims.company_info (company_id, company_name)
SELECT 1, 'My Company'
WHERE NOT EXISTS (SELECT 1 FROM ims.company_info WHERE company_id = 1);

