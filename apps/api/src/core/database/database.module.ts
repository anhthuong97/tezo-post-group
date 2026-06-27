import { Global, Module } from '@nestjs/common';
import { Pool } from 'pg';

export const PG_POOL = 'PG_POOL';

@Global()
@Module({
  providers: [
    {
      provide: PG_POOL,
      useFactory: () => {
        const pool = new Pool({
          host:                    process.env.DB_HOST     || 'localhost',
          port:                    parseInt(process.env.DB_PORT || '5432'),
          database:                process.env.DB_NAME     || 'tezo',
          user:                    process.env.DB_USER     || 'admin',
          password:                process.env.DB_PASSWORD || '',
          max:                     20,
          idleTimeoutMillis:       30000,
          connectionTimeoutMillis: 5000,
        });
        pool.on('error', (err) => console.error('PostgreSQL pool error:', err));
        return pool;
      },
    },
  ],
  exports: [PG_POOL],
})
export class DatabaseModule {}
