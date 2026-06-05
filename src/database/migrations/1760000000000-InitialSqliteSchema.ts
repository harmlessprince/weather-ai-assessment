import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSqliteSchema1760000000000 implements MigrationInterface {
  name = 'InitialSqliteSchema1760000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "subscriptions" (
        "id" varchar PRIMARY KEY NOT NULL,
        "email" varchar(254) NOT NULL,
        "location_label" varchar(160) NOT NULL,
        "latitude" real NOT NULL,
        "longitude" real NOT NULL,
        "alertTypes" text NOT NULL DEFAULT ('["heavy_rain","storm_alert"]'),
        "notificationChannel" varchar(24) NOT NULL DEFAULT ('email'),
        "status" varchar(24) NOT NULL DEFAULT ('active'),
        "last_polled_at" datetime,
        "created_at" datetime NOT NULL DEFAULT (datetime('now')),
        "updated_at" datetime NOT NULL DEFAULT (datetime('now'))
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_subscriptions_email_coordinates"
      ON "subscriptions" ("email", "latitude", "longitude")
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "weather_alerts" (
        "id" varchar PRIMARY KEY NOT NULL,
        "subscription_id" varchar NOT NULL,
        "alert_type" varchar(40) NOT NULL,
        "severity" varchar(24) NOT NULL DEFAULT ('warning'),
        "location_label" varchar(160) NOT NULL,
        "latitude" real NOT NULL,
        "longitude" real NOT NULL,
        "signal_source" varchar(24) NOT NULL,
        "forecast_window_start" datetime NOT NULL,
        "triggered_at" datetime NOT NULL,
        "fingerprint" varchar(160) NOT NULL,
        "summary" text NOT NULL,
        "matched_value" real,
        "threshold_value" real,
        "payload" text,
        "delivery_status" varchar(24) NOT NULL DEFAULT ('pending'),
        "delivery_attempted_at" datetime,
        "delivered_at" datetime,
        "delivery_error" text,
        "created_at" datetime NOT NULL DEFAULT (datetime('now')),
        CONSTRAINT "FK_weather_alerts_subscription"
          FOREIGN KEY ("subscription_id")
          REFERENCES "subscriptions" ("id")
          ON DELETE CASCADE
          ON UPDATE NO ACTION
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_weather_alerts_subscription_type_fingerprint"
      ON "weather_alerts" ("subscription_id", "alert_type", "fingerprint")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_weather_alerts_subscription_type_triggered"
      ON "weather_alerts" ("subscription_id", "alert_type", "triggered_at")
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP INDEX IF EXISTS "IDX_weather_alerts_subscription_type_triggered"',
    );
    await queryRunner.query(
      'DROP INDEX IF EXISTS "IDX_weather_alerts_subscription_type_fingerprint"',
    );
    await queryRunner.query('DROP TABLE IF EXISTS "weather_alerts"');
    await queryRunner.query(
      'DROP INDEX IF EXISTS "IDX_subscriptions_email_coordinates"',
    );
    await queryRunner.query('DROP TABLE IF EXISTS "subscriptions"');
  }
}
