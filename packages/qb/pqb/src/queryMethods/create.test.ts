import {
  assertType,
  Chat,
  db,
  expectQueryNotMutated,
  expectSql,
  Message,
  MessageRecord,
  User,
  userData,
  UserRecord,
  useTestDatabase,
} from '../test-utils/test-utils';
import { OnConflictQueryBuilder } from './create';

describe('create functions', () => {
  useTestDatabase();

  describe('createRaw', () => {
    it('should create with raw sql and list of columns', () => {
      const q = User.all();

      const query = q.createRaw({
        columns: ['name', 'password'],
        values: db.raw('raw sql'),
      });
      expectSql(
        query.toSql(),
        `
          INSERT INTO "user"("name", "password")
          VALUES raw sql
          RETURNING *
        `,
      );

      assertType<Awaited<typeof query>, UserRecord[]>();

      expectQueryNotMutated(q);
    });
  });

  describe('create', () => {
    it('should create one record, returning record', async () => {
      const q = User.all();

      const query = q.create(userData);
      expectSql(
        query.toSql(),
        `
        INSERT INTO "user"("name", "password")
        VALUES ($1, $2)
        RETURNING *
      `,
        ['name', 'password'],
      );

      const result = await query;
      expect(result).toMatchObject(userData);

      assertType<typeof result, UserRecord>();

      const created = await User.take();
      expect(created).toMatchObject(userData);

      expectQueryNotMutated(q);
    });

    it('should create one record, returning value', async () => {
      const q = User.all();

      const query = q.get('id').create(userData);
      expectSql(
        query.toSql(),
        `
        INSERT INTO "user"("name", "password")
        VALUES ($1, $2)
        RETURNING "user"."id"
      `,
        ['name', 'password'],
      );

      const result = await query;
      assertType<typeof result, number>();

      expect(typeof result).toBe('number');

      expectQueryNotMutated(q);
    });

    it('should create one record, returning columns', async () => {
      const q = User.all();

      const query = q.select('id', 'name').create(userData);
      expectSql(
        query.toSql(),
        `
        INSERT INTO "user"("name", "password")
        VALUES ($1, $2)
        RETURNING "user"."id", "user"."name"
      `,
        ['name', 'password'],
      );

      const result = await query;
      assertType<typeof result, { id: number; name: string }>();

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { password, ...other } = userData;
      expect(result).toMatchObject(other);

      expectQueryNotMutated(q);
    });

    it('should create one record, returning created count', async () => {
      const q = User.all();

      const query = q.count().create(userData);
      expectSql(
        query.toSql(),
        `
        INSERT INTO "user"("name", "password")
        VALUES ($1, $2)
      `,
        ['name', 'password'],
      );

      const result = await query;
      assertType<typeof result, number>();

      expect(result).toBe(1);

      expectQueryNotMutated(q);
    });

    it('should create record with provided defaults', () => {
      const query = User.defaults({
        name: 'name',
        password: 'password',
      }).create({
        password: 'override',
      });

      expectSql(
        query.toSql(),
        `
          INSERT INTO "user"("name", "password")
          VALUES ($1, $2)
          RETURNING *
        `,
        ['name', 'override'],
      );
    });

    it('should strip unknown keys', () => {
      const query = User.create({
        name: 'name',
        password: 'password',
        unknown: 'should be stripped',
      } as unknown as UserRecord);

      expectSql(
        query.toSql(),
        `
          INSERT INTO "user"("name", "password")
          VALUES ($1, $2)
          RETURNING *
        `,
        ['name', 'password'],
      );
    });
  });

  describe('createMany', () => {
    it('should create many records, returning inserted count', async () => {
      const q = User.all();

      const arr = [
        {
          ...userData,
          picture: null,
        },
        userData,
      ];

      const query = q.count().createMany(arr);

      expectSql(
        query.toSql(),
        `
        INSERT INTO "user"("name", "password", "picture")
        VALUES
          ($1, $2, $3),
          ($4, $5, DEFAULT)
      `,
        ['name', 'password', null, 'name', 'password'],
      );

      const result = await query;
      expect(result).toBe(2);

      assertType<typeof result, number>();

      const inserted = await User.all();
      inserted.forEach((item, i) => {
        expect(item).toMatchObject(arr[i]);
      });

      expectQueryNotMutated(q);
    });

    it('should create many records, returning columns', async () => {
      const q = User.all();

      const arr = [
        {
          ...userData,
          picture: null,
        },
        userData,
      ];

      const query = q.select('id', 'name').createMany(arr);

      expectSql(
        query.toSql(),
        `
        INSERT INTO "user"("name", "password", "picture")
        VALUES
          ($1, $2, $3),
          ($4, $5, DEFAULT)
        RETURNING "user"."id", "user"."name"
      `,
        ['name', 'password', null, 'name', 'password'],
      );

      const result = await query;
      assertType<typeof result, { id: number; name: string }[]>();

      const inserted = await User.all();
      inserted.forEach((item, i) => {
        expect(item).toMatchObject(arr[i]);
      });

      expectQueryNotMutated(q);
    });

    it('should create many records, returning all columns', async () => {
      const q = User.all();

      const arr = [
        {
          ...userData,
          picture: null,
        },
        userData,
      ];

      const query = q.createMany(arr);

      expectSql(
        query.toSql(),
        `
        INSERT INTO "user"("name", "password", "picture")
        VALUES
          ($1, $2, $3),
          ($4, $5, DEFAULT)
        RETURNING *
      `,
        ['name', 'password', null, 'name', 'password'],
      );

      const result = await query;
      result.forEach((item, i) => {
        expect(item).toMatchObject(arr[i]);
      });

      assertType<typeof result, typeof User['type'][]>();

      const inserted = await User.all();
      inserted.forEach((item, i) => {
        expect(item).toMatchObject(arr[i]);
      });

      expectQueryNotMutated(q);
    });

    it('should strip unknown keys', () => {
      const query = User.createMany([
        {
          name: 'name',
          password: 'password',
          unknown: 'should be stripped',
        },
        {
          name: 'name',
          password: 'password',
          unknown: 'should be stripped',
        },
      ] as unknown as UserRecord[]);

      expectSql(
        query.toSql(),
        `
          INSERT INTO "user"("name", "password")
          VALUES ($1, $2), ($3, $4)
          RETURNING *
        `,
        ['name', 'password', 'name', 'password'],
      );
    });
  });

  describe('createFrom', () => {
    it('should create record from select', () => {
      const query = Message.createFrom(Chat.find(1).select({ chatId: 'id' }), {
        authorId: 1,
        text: 'text',
      });

      assertType<Awaited<typeof query>, MessageRecord>();

      expectSql(
        query.toSql(),
        `
          INSERT INTO "message"("chatId", "authorId", "text")
          SELECT "chat"."id" AS "chatId", $1, $2
          FROM "chat"
          WHERE "chat"."id" = $3
          LIMIT $4
          RETURNING *
        `,
        [1, 'text', 1, 1],
      );
    });

    it('should not allow to create from query which returns multiple records', () => {
      expect(() =>
        Message.createFrom(
          // @ts-expect-error creating from multiple records is not allowed
          Chat.where({ id: { in: [1, 2] } }).select({ chatId: 'id' }),
          {
            authorId: 1,
            text: 'text',
          },
        ),
      ).toThrow(
        'Cannot create based on a query which returns multiple records',
      );
    });
  });

  describe('onConflict', () => {
    it('should return special query builder and return previous after ignore or merge', () => {
      const q = User.all();

      const originalQuery = q.count().create(userData);
      const onConflictQuery = q.onConflict();
      expect(originalQuery instanceof OnConflictQueryBuilder).not.toBe(true);
      expect(onConflictQuery instanceof OnConflictQueryBuilder).toBe(true);
      expect(onConflictQuery instanceof OnConflictQueryBuilder).toBe(true);
      expect(
        onConflictQuery.ignore() instanceof OnConflictQueryBuilder,
      ).not.toBe(true);
      expect(
        onConflictQuery.merge() instanceof OnConflictQueryBuilder,
      ).not.toBe(true);

      expectQueryNotMutated(q);
    });

    it('should accept where condition', () => {
      const q = User.all();

      const query = q
        .select('id')
        .create(userData)
        .onConflict('name')
        .ignore()
        .where({ name: 'where name' });

      expectSql(
        query.toSql(),
        `
            INSERT INTO "user"("name", "password")
            VALUES ($1, $2)
            ON CONFLICT ("name")
            DO NOTHING
            WHERE "user"."name" = $3
            RETURNING "user"."id"
          `,
        ['name', 'password', 'where name'],
      );

      expectQueryNotMutated(q);
    });

    describe('ignore', () => {
      it('should set `ON CONFLICT` to all columns if no arguments provided', () => {
        const q = User.all();

        const query = q.count().create(userData).onConflict().ignore();
        expectSql(
          query.toSql(),
          `
            INSERT INTO "user"("name", "password")
            VALUES ($1, $2)
            ON CONFLICT ("name", "password")
            DO NOTHING
          `,
          ['name', 'password'],
        );

        expectQueryNotMutated(q);
      });

      it('should accept single column', () => {
        const q = User.all();

        const query = q.count().create(userData).onConflict('id').ignore();
        expectSql(
          query.toSql(),
          `
            INSERT INTO "user"("name", "password")
            VALUES ($1, $2)
            ON CONFLICT ("id") DO NOTHING
          `,
          ['name', 'password'],
        );

        expectQueryNotMutated(q);
      });

      it('should accept multiple columns', () => {
        const q = User.all();

        const query = q
          .count()
          .create(userData)
          .onConflict(['id', 'name'])
          .ignore();
        expectSql(
          query.toSql(),
          `
            INSERT INTO "user"("name", "password")
            VALUES ($1, $2)
            ON CONFLICT ("id", "name") DO NOTHING
          `,
          ['name', 'password'],
        );

        expectQueryNotMutated(q);
      });

      it('can accept raw query', () => {
        const q = User.all();

        const query = q
          .count()
          .create(userData)
          .onConflict(db.raw('raw query'))
          .ignore();
        expectSql(
          query.toSql(),
          `
            INSERT INTO "user"("name", "password")
            VALUES ($1, $2)
            ON CONFLICT raw query DO NOTHING
          `,
          ['name', 'password'],
        );

        expectQueryNotMutated(q);
      });
    });

    describe('merge', () => {
      it('should update all columns when calling without arguments', () => {
        const q = User.all();

        const query = q.count().create(userData).onConflict().merge();
        expectSql(
          query.toSql(),
          `
            INSERT INTO "user"("name", "password")
            VALUES ($1, $2)
            ON CONFLICT ("name", "password")
            DO UPDATE SET
              "name" = excluded."name",
              "password" = excluded."password"
          `,
          ['name', 'password'],
        );

        expectQueryNotMutated(q);
      });

      it('should accept single column', () => {
        const q = User.all();

        const query = q
          .count()
          .create(userData)
          .onConflict('name')
          .merge('name');
        expectSql(
          query.toSql(),
          `
            INSERT INTO "user"("name", "password")
            VALUES ($1, $2)
            ON CONFLICT ("name")
            DO UPDATE SET "name" = excluded."name"
          `,
          ['name', 'password'],
        );

        expectQueryNotMutated(q);
      });

      it('should accept multiple columns', () => {
        const q = User.all();

        const query = q
          .count()
          .create(userData)
          .onConflict(['name', 'password'])
          .merge(['name', 'password']);

        expectSql(
          query.toSql(),
          `
            INSERT INTO "user"("name", "password")
            VALUES ($1, $2)
            ON CONFLICT ("name", "password")
            DO UPDATE SET
              "name" = excluded."name",
              "password" = excluded."password"
          `,
          ['name', 'password'],
        );

        expectQueryNotMutated(q);
      });

      it('should accept object with values to update', () => {
        const q = User.all();

        const query = q
          .count()
          .create(userData)
          .onConflict('name')
          .merge({ name: 'new name' });

        expectSql(
          query.toSql(),
          `
            INSERT INTO "user"("name", "password")
            VALUES ($1, $2)
            ON CONFLICT ("name")
            DO UPDATE SET "name" = $3
          `,
          ['name', 'password', 'new name'],
        );

        expectQueryNotMutated(q);
      });

      it('should accept raw sql', () => {
        const q = User.all();

        const query = q
          .count()
          .create(userData)
          .onConflict(db.raw('on conflict raw'))
          .merge(db.raw('merge raw'));

        expectSql(
          query.toSql(),
          `
            INSERT INTO "user"("name", "password")
            VALUES ($1, $2)
            ON CONFLICT on conflict raw
            DO UPDATE SET merge raw
          `,
          ['name', 'password'],
        );

        expectQueryNotMutated(q);
      });
    });
  });
});
