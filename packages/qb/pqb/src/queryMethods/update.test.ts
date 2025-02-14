import {
  assertType,
  db,
  expectQueryNotMutated,
  expectSql,
  User,
  userData,
  UserRecord,
  useTestDatabase,
} from '../test-utils/test-utils';

describe('update', () => {
  useTestDatabase();

  const update = {
    name: 'new name',
    password: 'new password',
  };

  it('should not mutate query', () => {
    const q = User.all();
    q.where({ name: 'name' }).update(update);
    expectQueryNotMutated(q);
  });

  it('should prevent from updating without conditions with TS error', () => {
    // @ts-expect-error update should have where condition or forceAll flag
    User.update({ name: 'new name' });
  });

  it('should let update all with empty where', () => {
    User.where().update({ name: 'new name' });
  });

  it('should update record with raw sql, returning updated rows count', async () => {
    const count = 2;
    const users = await User.select('id').createMany([userData, userData]);

    const query = User.or(...users).updateRaw(db.raw(`name = 'name'`));
    expectSql(
      query.toSql(),
      `
        UPDATE "user"
        SET name = 'name', "updatedAt" = now()
        WHERE "user"."id" = $1 OR "user"."id" = $2
      `,
      [users[0].id, users[1].id],
    );

    assertType<Awaited<typeof query>, number>();

    const result = await query;
    expect(result).toBe(count);
  });

  it('should update record, returning updated row count', async () => {
    const { id } = await User.select('id').create(userData);

    const update = {
      name: 'new name',
      password: 'new password',
    };

    const query = User.where({ id }).update(update);
    expectSql(
      query.toSql(),
      `
        UPDATE "user"
        SET "name" = $1,
            "password" = $2,
            "updatedAt" = now()
        WHERE "user"."id" = $3
      `,
      [update.name, update.password, id],
    );

    const result = await query;
    assertType<typeof result, number>();

    expect(result).toBe(1);

    const updated = await User.take();
    expect(updated).toMatchObject({ ...userData, ...update });
  });

  it('should update record, returning value', async () => {
    const id = await User.get('id').create(userData);

    const update = {
      name: 'new name',
      password: 'new password',
    };

    const query = User.find(id).get('id').update(update);
    expectSql(
      query.toSql(),
      `
        UPDATE "user"
        SET "name" = $1,
            "password" = $2,
            "updatedAt" = now()
        WHERE "user"."id" = $3
        RETURNING "user"."id"
      `,
      [update.name, update.password, id],
    );

    const result = await query;
    assertType<typeof result, number>();

    expect(typeof result).toBe('number');

    const updated = await User.take();
    expect(updated).toMatchObject({ ...userData, ...update });
  });

  it('should update one record, return selected columns', async () => {
    const id = await User.get('id').create(userData);

    const query = User.select('id', 'name').find(id).update(update);

    expectSql(
      query.toSql(),
      `
        UPDATE "user"
        SET "name" = $1,
            "password" = $2,
            "updatedAt" = now()
        WHERE "user"."id" = $3
        RETURNING "user"."id", "user"."name"
      `,
      [update.name, update.password, id],
    );

    const result = await query;
    assertType<typeof result, { id: number; name: string }>();

    const updated = await User.take();
    expect(updated).toMatchObject({ ...userData, ...update });
  });

  it('should update one record, return all columns', async () => {
    const id = await User.get('id').create(userData);

    const query = User.selectAll().find(id).update(update);

    expectSql(
      query.toSql(),
      `
        UPDATE "user"
        SET "name" = $1,
            "password" = $2,
            "updatedAt" = now()
        WHERE "user"."id" = $3
        RETURNING *
      `,
      [update.name, update.password, id],
    );

    const result = await query;
    assertType<typeof result, typeof User.type>();

    const updated = await User.take();
    expect(updated).toMatchObject({ ...userData, ...update });
  });

  it('should update multiple records, returning selected columns', async () => {
    const ids = await User.pluck('id').createMany([userData, userData]);

    const update = {
      name: 'new name',
      password: 'new password',
    };

    const query = User.select('id', 'name')
      .where({ id: { in: ids } })
      .update(update);

    expectSql(
      query.toSql(),
      `
        UPDATE "user"
        SET "name" = $1,
            "password" = $2,
            "updatedAt" = now()
        WHERE "user"."id" IN ($3, $4)
        RETURNING "user"."id", "user"."name"
      `,
      [update.name, update.password, ids[0], ids[1]],
    );

    const result = await query;
    assertType<typeof result, { id: number; name: string }[]>();

    const updated = await User.take();
    expect(updated).toMatchObject({ ...userData, ...update });
  });

  it('should update multiple records, returning all columns', async () => {
    const ids = await User.pluck('id').createMany([userData, userData]);

    const update = {
      name: 'new name',
      password: 'new password',
    };

    const query = User.selectAll()
      .where({ id: { in: ids } })
      .update(update);

    expectSql(
      query.toSql(),
      `
        UPDATE "user"
        SET "name" = $1,
            "password" = $2,
            "updatedAt" = now()
        WHERE "user"."id" IN ($3, $4)
        RETURNING *
      `,
      [update.name, update.password, ids[0], ids[1]],
    );

    const result = await query;
    expect(result[0]).toMatchObject({ ...userData, ...update });

    assertType<typeof result, typeof User['type'][]>();

    const updated = await User.take();
    expect(updated).toMatchObject({ ...userData, ...update });
  });

  it('should ignore undefined values, and should not ignore null', () => {
    const query = User.where({ id: 1 }).update({
      name: 'new name',
      password: undefined,
      data: null,
    });
    expectSql(
      query.toSql(),
      `
        UPDATE "user"
        SET "name" = $1,
            "data" = $2,
            "updatedAt" = now()
        WHERE "user"."id" = $3
      `,
      ['new name', null, 1],
    );

    assertType<Awaited<typeof query>, number>();
  });

  it('should support raw sql as a value', () => {
    const query = User.where({ id: 1 }).update({
      name: db.raw(`'raw sql'`),
    });
    expectSql(
      query.toSql(),
      `
        UPDATE "user"
        SET "name" = 'raw sql', "updatedAt" = now()
        WHERE "user"."id" = $1
      `,
      [1],
    );

    assertType<Awaited<typeof query>, number>();
  });

  it('should return one record when searching for one to update', async () => {
    const { id } = await User.select('id').create(userData);

    const update = {
      name: 'new name',
      password: 'new password',
    };

    const query = User.selectAll().findBy({ id }).update(update);
    expectSql(
      query.toSql(),
      `
        UPDATE "user"
        SET "name" = $1,
            "password" = $2,
            "updatedAt" = now()
        WHERE "user"."id" = $3
        RETURNING *
      `,
      [update.name, update.password, id],
    );

    const result = await query;
    assertType<typeof result, typeof User.type>();

    expect(result).toMatchObject({ ...userData, ...update });
  });

  it('should throw when searching for one to update and it is not found', async () => {
    const query = User.selectAll()
      .findBy({ id: 1 })
      .update({ name: 'new name' });

    assertType<Awaited<typeof query>, typeof User.type>();

    await expect(query).rejects.toThrow();
  });

  describe('updateOrThrow', () => {
    it('should throw if no records were found for update', async () => {
      await expect(
        User.where({ name: 'not found' }).updateOrThrow({ name: 'name' }),
      ).rejects.toThrow();

      await expect(
        User.select('id')
          .where({ name: 'not found' })
          .updateOrThrow({ name: 'name' }),
      ).rejects.toThrow();
    });
  });

  it('should strip unknown keys', () => {
    const query = User.find(1).update({
      name: 'name',
      unknown: 'should be stripped',
    } as unknown as UserRecord);

    expectSql(
      query.toSql(),
      `
        UPDATE "user"
        SET "name" = $1, "updatedAt" = now()
        WHERE "user"."id" = $2
      `,
      ['name', 1],
    );
  });

  describe('increment', () => {
    it('should not mutate query', () => {
      const q = User.all();
      q.where({ name: 'name' }).increment('age');
      expectQueryNotMutated(q);
    });

    it('should increment column by 1', () => {
      const query = User.increment('age');
      expectSql(
        query.toSql(),
        `
          UPDATE "user"
          SET "age" = "age" + $1,
              "updatedAt" = now()
        `,
        [1],
      );
    });

    it('should increment column by provided amount', () => {
      const query = User.increment({ age: 3 });
      expectSql(
        query.toSql(),
        `
          UPDATE "user"
          SET "age" = "age" + $1,
              "updatedAt" = now()
        `,
        [3],
      );
    });

    it('should support returning', () => {
      const query = User.select('id').increment({ age: 3 });
      expectSql(
        query.toSql(),
        `
          UPDATE "user"
          SET "age" = "age" + $1,
              "updatedAt" = now()
          RETURNING "user"."id"
        `,
        [3],
      );

      assertType<Awaited<typeof query>, { id: number }[]>();
    });
  });

  describe('decrement', () => {
    it('should decrement column by 1', () => {
      const query = User.decrement('age');
      expectSql(
        query.toSql(),
        `
          UPDATE "user"
          SET "age" = "age" - $1,
              "updatedAt" = now()
        `,
        [1],
      );
    });

    it('should decrement column by provided amount', () => {
      const query = User.decrement({ age: 3 });
      expectSql(
        query.toSql(),
        `
          UPDATE "user"
          SET "age" = "age" - $1,
              "updatedAt" = now()
        `,
        [3],
      );
    });

    it('should support returning', () => {
      const query = User.select('id').decrement({ age: 3 });
      expectSql(
        query.toSql(),
        `
          UPDATE "user"
          SET "age" = "age" - $1,
              "updatedAt" = now()
          RETURNING "user"."id"
        `,
        [3],
      );

      assertType<Awaited<typeof query>, { id: number }[]>();
    });
  });

  describe('chaining', () => {
    it('should handle multiple updates with increment and decrement', () => {
      const query = User.select('id')
        .find(1)
        .update({ name: 'name' })
        .increment('id')
        .update({ password: 'password' })
        .decrement('age');

      expectSql(
        query.toSql(),
        `
          UPDATE "user"
          SET "name" = $1,
              "id" = "id" + $2,
              "password" = $3,
              "age" = "age" - $4,
              "updatedAt" = now()
          WHERE "user"."id" = $5
          RETURNING "user"."id"
        `,
        ['name', 1, 'password', 1, 1],
      );
    });
  });
});
