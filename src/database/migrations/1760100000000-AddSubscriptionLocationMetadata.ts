import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSubscriptionLocationMetadata1760100000000 implements MigrationInterface {
  name = 'AddSubscriptionLocationMetadata1760100000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasColumn('subscriptions', 'location_timezone'))) {
      await queryRunner.query(
        'ALTER TABLE "subscriptions" ADD COLUMN "location_timezone" varchar(80)',
      );
    }

    if (!(await queryRunner.hasColumn('subscriptions', 'location_country'))) {
      await queryRunner.query(
        'ALTER TABLE "subscriptions" ADD COLUMN "location_country" varchar(80)',
      );
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasColumn('subscriptions', 'location_country')) {
      await queryRunner.dropColumn('subscriptions', 'location_country');
    }

    if (await queryRunner.hasColumn('subscriptions', 'location_timezone')) {
      await queryRunner.dropColumn('subscriptions', 'location_timezone');
    }
  }
}
