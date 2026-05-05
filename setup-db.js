const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
require('dotenv').config();

async function setupDatabase() {
    // Create a connection without specifying the database first
    const connection = await mysql.createConnection({
        host: process.env.DB_HOST || 'localhost',
        port: process.env.DB_PORT || 3306,
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        multipleStatements: true
    });

    try {
        console.log('Creating database and tables...');
        
        // Create database if not exists
        await connection.query('CREATE DATABASE IF NOT EXISTS clinivoice CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
        await connection.query('USE clinivoice');

        // Create tables
        await connection.query(`
            CREATE TABLE IF NOT EXISTS patients (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                email VARCHAR(255),
                phone VARCHAR(50),
                domain VARCHAR(50) NOT NULL,
                notes TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_domain (domain)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

            CREATE TABLE IF NOT EXISTS users (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id VARCHAR(255) UNIQUE NOT NULL,
                domain VARCHAR(50) NOT NULL,
                password_hash VARCHAR(255),
                name VARCHAR(255),
                email VARCHAR(255),
                role VARCHAR(50) DEFAULT 'clinician',
                reset_token VARCHAR(255) NULL,
                reset_expires DATETIME NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                last_login TIMESTAMP NULL,
                INDEX idx_user_id (user_id),
                INDEX idx_domain (domain)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

            CREATE TABLE IF NOT EXISTS sessions (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id VARCHAR(255) NOT NULL,
                patient_id INT,
                domain VARCHAR(50) NOT NULL,
                transcription TEXT,
                ai_notes TEXT,
                status VARCHAR(50) DEFAULT 'recording',
                duration INT DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE SET NULL,
                INDEX idx_user_id (user_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `);

        // Create admin user
        const adminPassword = 'Adminpass2';
        const adminHash = await bcrypt.hash(adminPassword, 10);
        
        // Create test user
        const testPassword = 'test';
        const testHash = await bcrypt.hash(testPassword, 10);

        // Insert test patient
        const [patientResult] = await connection.query(
            'INSERT INTO patients (name, email, phone, domain) VALUES (?, ?, ?, ?)',
            ['John Doe', 'john@example.com', '1234567890', 'medical']
        );
        
        const patientId = patientResult.insertId;

        // Insert admin user
        await connection.query(
            'INSERT INTO users (user_id, domain, password_hash, name, email, role) VALUES (?, ?, ?, ?, ?, ?)',
            ['admin', 'medical', adminHash, 'Admin User', 'admin@clinivoice.com', 'admin']
        );

        // Insert test user
        await connection.query(
            'INSERT INTO users (user_id, domain, password_hash, name, email) VALUES (?, ?, ?, ?, ?)',
            ['test', 'medical', testHash, 'Test User', 'test@clinivoice.com']
        );

        // Create some test sessions
        await connection.query(
            'INSERT INTO sessions (user_id, patient_id, domain, status) VALUES (?, ?, ?, ?)',
            ['test', patientId, 'medical', 'completed']
        );

        console.log('✅ Database setup completed successfully!');
        console.log('Admin credentials:');
        console.log('  Username: admin');
        console.log('  Password: Adminpass2');
        console.log('\nTest user credentials:');
        console.log('  Username: test');
        console.log('  Password: test');

    } catch (error) {
        console.error('Error setting up database:', error);
    } finally {
        await connection.end();
    }
}

setupDatabase();
