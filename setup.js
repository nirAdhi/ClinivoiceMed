const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');
const prompt = require('prompt-sync')({sigint: true});

async function main() {
    console.log('🚀 Clinivoice Setup Wizard\n');
    
    // Get database credentials
    console.log('🔐 Database Configuration');
    const dbConfig = {
        host: prompt('Database host [localhost]: ') || 'localhost',
        port: parseInt(prompt('Database port [3306]: ') || '3306'),
        user: prompt('Database username [root]: ') || 'root',
        password: prompt('Database password: ', {echo: '*'}) || '',
        database: 'clinivoice'
    };

    console.log('\n🔧 Setting up database...');
    
    try {
        // Test connection
        const connection = await mysql.createConnection({
            host: dbConfig.host,
            port: dbConfig.port,
            user: dbConfig.user,
            password: dbConfig.password
        });

        // Create database if not exists
        await connection.query('CREATE DATABASE IF NOT EXISTS ?? CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci', [dbConfig.database]);
        await connection.query('USE ??', [dbConfig.database]);

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

        // Create .env file
        const envContent = `# Database Configuration
DB_HOST=${dbConfig.host}
DB_PORT=${dbConfig.port}
DB_USER=${dbConfig.user}
DB_PASSWORD=${dbConfig.password.replace(/[\$\`\\"]/g, '\\$&')}
DB_NAME=${dbConfig.database}

# Google Gemini API Key (get from https://makersuite.google.com/app/apikey)
GEMINI_API_KEY=your_gemini_api_key_here
`;

        fs.writeFileSync(path.join(__dirname, '.env'), envContent);

        console.log('\n✅ Setup completed successfully!');
        console.log('\n🔑 Admin credentials:');
        console.log('  Username: admin');
        console.log('  Password: Adminpass2');
        console.log('\n👤 Test user credentials:');
        console.log('  Username: test');
        console.log('  Password: test');
        console.log('\n🚀 Start the application with: npm start');

    } catch (error) {
        console.error('\n❌ Error during setup:', error.message);
        if (error.code === 'ER_ACCESS_DENIED_ERROR') {
            console.log('\n🔑 Please check your database credentials and try again.');
            console.log('   Make sure the MySQL server is running and the user has proper permissions.');
        }
    } finally {
        if (connection) await connection.end();
        process.exit();
    }
}

main();
