import {readdir, readFile} from 'fs/promises';
import psql from 'pg';

async function runMigrations() {
    const client = new psql.Client({
        user: 'lea',
        host: 'localhost',
        database: 'migration',
        password: '',
        port: 5432,
    });

    await client.connect();
    console.log('Connected to the database.');
    let migrationFiles = await readdir('./migrations');
    migrationFiles = migrationFiles.filter((file: string) => file.endsWith('.sql'));
    migrationFiles.sort();
    console.log('Migration files:', migrationFiles);

    // 1. check if the migrations table exists, if not create it
    const res = await client.query(`
        SELECT EXISTS (
            SELECT FROM information_schema.tables 
            WHERE table_name = 'migrations'
        );
    `);
    console.log('Migrations table exists:', res.rows[0].exists);
    if (!res.rows[0].exists) {
        await client.query(`
            CREATE TABLE migrations (
                id SERIAL PRIMARY KEY,
                filename VARCHAR(255) NOT NULL,
                applied_at TIMESTAMP NOT NULL DEFAULT NOW()
            );
        `);
        console.log('Created migrations table.');
    }

    // 2. get the list of already applied migrations
    const appliedMigrationsRes = await client.query('SELECT filename FROM migrations');
    // console.log('Applied migrations:', appliedMigrationsRes);
    const appliedMigrations = appliedMigrationsRes.rows.map((row: any) => row.filename);
    // User: what's the function of the "map" method in the above code?
    // Assistant: The "map" method in the above code is used to transform the array of rows returned from the database query into a new array that contains only the filenames of the applied migrations. Each row in the result set is an object, and the "map" method extracts the "filename" property from each object, creating a new array of filenames. This allows for easier comparison with the list of migration files to determine which migrations have already been applied.

    // User: can you give me an example case of the "map" method in the above code?
    // Assistant: Sure! Let's say the result of the query `SELECT filename FROM migrations` returns the following rows from the database:
    // The `appliedMigrationsRes.rows` would look like this:
    // [
    //     { filename: '001_initial_migration.sql' },
    //     { filename: '002_add_users_table.sql' }
    // ]
    // When we apply the `map` method to this array, it will extract the `filename` property from each object, resulting in a new array:
    // const appliedMigrations = appliedMigrationsRes.rows.map((row: any) => row.filename);
    // The `appliedMigrations` array will then look like this:
    // [
    //     '001_initial_migration.sql',
    //     '002_add_users_table.sql'
    // ]
    console.log('Already applied migrations:', appliedMigrations);

    // 3. apply the migrations that have not been applied yet
    for (const file of migrationFiles) {
        if (!appliedMigrations.includes(file)) {
            await client.query('BEGIN');
            try {
                const sql = await readFile(`./migrations/${file}`, 'utf-8');
                await client.query(sql);
                await client.query(
                    'INSERT INTO migrations (filename) VALUES ($1)',
                    [file]
                );
                await client.query('COMMIT');
            } catch (err) {
                await client.query('ROLLBACK');
                throw err;
            }
        } else {
            console.log(`Migration already applied: ${file}`);
        }
    }

    await client.end();
}

runMigrations().catch((err) => {
    console.error('Error running migrations:', err);
});

