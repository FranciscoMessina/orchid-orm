import { createFactory, TestFactory } from './factory';
import { assertType, db, User, useTestDatabase } from './test-utils';
import { z } from 'zod';
import { InstanceToZod } from 'porm-schema-to-zod';

describe('factory', () => {
  useTestDatabase();

  const userFactory = createFactory(db.user);

  describe('build', () => {
    it('should build an object for the model', () => {
      const data = userFactory.build();

      assertType<typeof data, User>();

      expect(() => userFactory.schema.parse(data)).not.toThrow();
    });

    it('should accept data with values to override result', () => {
      const data = userFactory.build({
        age: 18,
        name: 'name',
        extra: true,
      });

      assertType<typeof data, User & { age: number; extra: boolean }>();

      expect(data).toMatchObject({ age: 18, name: 'name', extra: true });
    });

    it('should accept data with functions to override result', () => {
      const data = userFactory.build({
        age: () => 18,
        name: () => 'name',
        extra: () => true,
      });

      assertType<typeof data, User & { age: number; extra: true }>();

      expect(data).toMatchObject({ age: 18, name: 'name', extra: true });
    });
  });

  describe('buildList', () => {
    const original = userFactory.build;
    const buildMock = jest.fn();

    beforeAll(() => {
      userFactory.build = buildMock;
    });

    afterAll(() => {
      userFactory.build = original;
    });

    it('should call build provided number of times, pass the argument, return array', () => {
      const arg = { extra: true };
      const arr = userFactory.buildList(3, arg);

      assertType<typeof arr, (User & { extra: boolean })[]>();

      expect(buildMock).toHaveBeenCalledTimes(3);
      expect(buildMock).toHaveBeenCalledWith(arg);
    });
  });

  describe('omit', () => {
    it('should allow to build data with omitted fields', () => {
      const data = userFactory.omit({ id: true, name: true }).build();

      assertType<typeof data, Omit<User, 'id' | 'name'>>();

      expect(() =>
        userFactory.schema.strict().omit({ id: true, name: true }).parse(data),
      ).not.toThrow();
    });
  });

  describe('pick', () => {
    it('should allow to build data with picked fields', () => {
      const data = userFactory.pick({ id: true, name: true }).build();

      assertType<typeof data, Pick<User, 'id' | 'name'>>();

      expect(() =>
        userFactory.schema.strict().pick({ id: true, name: true }).parse(data),
      ).not.toThrow();
    });
  });

  describe('create', () => {
    it('should create record with generated data', async () => {
      const item = await userFactory.create();

      assertType<typeof item, User>();

      expect(() => userFactory.schema.parse(item)).not.toThrow();
    });

    it('should create record with overridden data', async () => {
      const item = await userFactory.create({ name: 'name' });

      assertType<typeof item, User>();

      expect(item.name).toBe('name');
    });
  });

  describe('createList', () => {
    it('should create a list of records', async () => {
      const items = await userFactory.createList(2);

      assertType<typeof items, User[]>();

      expect(() => z.array(userFactory.schema).parse(items)).not.toThrow();
    });

    it('should create a list of records with overridden data', async () => {
      const items = await userFactory.createList(2, { name: 'name' });

      assertType<typeof items, User[]>();

      expect(items.map((item) => item.name)).toEqual(['name', 'name']);
    });
  });

  describe('set', () => {
    it('should set data to override result and work with build', () => {
      const data = userFactory
        .set({
          age: 18,
        })
        .build({
          name: 'name',
        });

      assertType<typeof data, User>();

      expect(data).toMatchObject({ age: 18, name: 'name' });
    });

    it('should set data to override result and work with buildList', () => {
      const arr = userFactory
        .set({
          age: 18,
        })
        .buildList(2, {
          name: 'name',
        });

      assertType<typeof arr, User[]>();
    });

    it('should set data to override result and work with create', async () => {
      const item = await userFactory.set({ age: 18 }).create();

      assertType<typeof item, User>();

      expect(() => userFactory.schema.parse(item)).not.toThrow();
      expect(item.age).toBe(18);
    });

    it('should set data to override result and work with createList', async () => {
      const items = await userFactory.set({ age: 18 }).createList(2);

      assertType<typeof items, User[]>();

      expect(() => z.array(userFactory.schema).parse(items)).not.toThrow();
      expect(items.map((item) => item.age)).toEqual([18, 18]);
    });
  });

  // describe('custom methods', () => {
  //   class ExtendedFactory extends TestFactory<
  //     InstanceToZod<typeof db.user>,
  //     typeof db.user['type']
  //   > {
  //     specificUser(age: number) {
  //       return this.set({
  //         age,
  //       });
  //     }
  //   }
  //
  //   const extendedFactory = new ExtendedFactory(db.user);
  //
  //   it('should be chainable with build', async () => {
  //     const data = extendedFactory.specificUser(42).build();
  //
  //     assertType<typeof data, User>();
  //
  //     expect(data).toMatchObject({ age: 42, name: 'specific' });
  //   });
  // });
});
