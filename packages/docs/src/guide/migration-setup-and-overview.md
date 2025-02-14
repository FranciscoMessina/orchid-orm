# Migrations setup and overview

Migrations allow you to evolve your database schema over time. This migration toolkit has several benefits over writing raw SQL migrations or using other tools:

- write migrations in TypeScript
- write only code to create or add something, and it will be automatically possible to undo the migration
- it shares the same column types library as the ORM, which allows you to write a `createTable` migration and copy-paste columns to your table class

## setup

Install this tool by running:

```sh
npm i -D rake-db
```

Add a script file somewhere to your project, and ensure it's located in one of `include` locations of your `tsconfig.json`.

For example, it could be located in `scripts/db.ts` in your project.

Since the configuration is done in a regular TypeScript, it's possible to perform any logic and use any configuration tools to specify database connection options.

In the following example, `dotenv` is used and configured to first get env variables from `.env.local` and then to get them from the `.env` file.

```ts
// scripts/db.ts
import { config } from 'dotenv'
import path from 'path'
import { rakeDb } from 'rake-db'
import { appCodeUpdater } from 'orchid-orm';

config({ path: path.resolve(process.cwd(), '.env.local') })
config()

const databaseURL = process.env.DATABASE_URL;
if (!databaseURL) {
  throw new Error('DATABASE_URL is missing in .env');
}

rakeDb(
  {
    databaseURL,
    // ssl option can be set here or as a URL parameter on databaseURL
    ssl: true
  },
  {
    // relative path to the current file:
    migrationsPath: '../migrations',
    // it also can be an absolute path:
    // migrationsPath: path.resolve(__dirname, 'migrations'),
    
    // optionally, for automatic code updating after running migrations:
    appCodeUpdater: appCodeUpdater({
      // paths are relative to the current file
      tablePath: (tableName) => `../tables/${tableName}.table.ts`,
      baseTablePath: '../lib/baseTable.ts',
      // baseTableName is optional, BaseTable by default
      baseTableName: 'BaseTable',
      mainFilePath: '../db.ts',
    }),
    
    // true by default, whether to use code updater by default
    useCodeUpdater: false,
    
    // custom commands can be defined as follows:
    commands: {
      // dbOptions is an array of database configs
      // config is the config of `rakeDb` (that contains migrationPath, appCodeUpdater, etc)
      // args of type string[] is an array of command line arguments startring after the command name
      async seed(dbOptions, config, args) {
        const { run } = await import('../db/seed')
        await run()
      }
    }
  },
);
```

Add the `db` script to your `package.json`:

```json
{
  "scripts": {
    "db": "ts-node scripts/db.ts"
  }
}
```

And now it's possible to use it from a command line:

```sh
npm run db g createSomeTable
pnpm run db g createSomeTable
yarn db g createSomeTable
```

## rakeDb

`rakeDb` function in the setup script takes connection options, migration config, and command line arguments:

```ts
const rakeDb = async (
  options: MaybeArray<AdapterOptions>,
  partialConfig?: Partial<MigrationConfig>,
  args: string[] = process.argv.slice(2),
) => {
  // ...
}
```

The first is of the same type `AdapterOptions` which is used when configuring the query builder and the ORM.
Provide an array of such options to migrate two and more databases at the same time, which helps maintain a test database.

The second optional argument of type `MigrationConfig`, all properties are optional, here is the type:

```ts
type MigrationConfig = {
  // path to resolve other relative paths with
  basePath?: string
  
  // path to migrations directory
  migrationsPath?: string;
  
  // table in your database to store migrated versions
  migrationsTable?: string;
  
  // function to import typescript migration file
  import?(path: string): void;
  
  // specify behavior for what to do when no primary key was defined on a table
  noPrimaryKey?: 'error' | 'warn' | 'ignore';
  
  // log options, see "log option" in the query builder document
  log?: boolean | Partial<QueryLogObject>;
  logger?: {
    log(message: string): void;
    error(message: string): void;
  };

  appCodeUpdater?(params: {
    // abstract syntax tree of changes
    ast: RakeDbAst;
    // connection options
    options: AdapterOptions;
    // to resolve relative paths
    basePath: string;
    // the same object is passed between various appCodeUpdater calls
    cache: object;
  }): Promise<void>;

  useCodeUpdater?: boolean;
  
  beforeMigrate?(db: Db): Promise<void>;
  afterMigrate?(db: Db): Promise<void>;
  beforeRollback?(db: Db): Promise<void>;
  afterRollback?(db: Db): Promise<void>;
}
```

To configure logging, see [log option](/guide/query-builder.html#createdb) in the query builder document.

Note that `migrationsPath` can accept an absolute path, or a relative path to the current file.

Defaults are:

- `basePath` is the dir name of the file you're calling `rakeDb` from
- `migrationPath` is `src/db/migrations`
- `migrationsTable` is `schemaMigrations`
- `import` will use a standard `import` function
- `noPrimaryKey` is `error`
- `log` is on
- `logger` is a standard `console`
- `useCodeUpdater` is `true`

The third optional argument of `rakeDb` is an array of strings from the command line, by default it will use `process.argv` to get the arguments, but you can override it by passing arguments manually.

## appCodeUpdater

`appCodeUpdater` is a module that will add new and update existing project files when running migrations.

To prevent running when not needed, append `--code false` flag to cli command:

```sh
npm run db migrate --code false
```

If you don't want to run it on every migration, set `useCodeUpdater` to false and run migration with `--code` flag to run code updater when needed:

```sh
npm run db migrate --code
```

What `appCodeUpdater` does:

- creates base table file if it doesn't exist
- creates main `db` file if it doesn't exist
- creates a new table file when creating a table
- adds table entry to `db` file when creating a table
- adds new columns, indexes, and foreign keys to the table file when they are added in a migration
- changes columns, indexes, and foreign keys in the table file when they are changed in a migration
- changes `table` and `schema` property in the table file when renaming a table
- removes table entry from `db` file when dropping a table

`appCodeUpdater` does not delete or rename existing files, because it is better to be done manually.
A modern editor will update all file usage in imports across the project when renaming a file or an exported class.

## seeds

To make database seeds, create own script with the needed logic.

In the example, new db instance is constructed with `createDb`,
but you can import `db` object from where it's defined in your app.

```ts
// db/seed.ts
import { createDb, AdapterOptions } from 'pqb'

export const run = async (options: AdapterOptions) => {
  const db = createDb(options)
  
  await db('table').createMany([
    { name: 'record 1' },
    { name: 'record 2' },
  ])
  
  await db.close()
}
```

Set up a script for seeding data via a custom command of `rake-db` as follows:

```ts
// scripts/db.ts
import { rakeDb } from 'rake-db'
import { createDb } from 'pqb'

rakeDb(
  {
    databaseURL: 'postgres://...',
  },
  {
    commands: {
      async seed(options) {
        // there can be multiple databases, so `options` is an array
        // here we want to seed only the first database:
        const devDbOptions = options[0]
        
        const { run } = await import('../db/seed')
        await run(devDbOptions)
      },
    }
  }
)
```

Run the seeds with the command:

```sh
npm run db seed
```

## before and after callbacks

To run custom code before or after `migrate` or `rollback` command, define functions in `rakeDb` config object:

Supported callbacks are `beforeMigrate`, `afterMigrate`, `beforeRollback`, `afterRollback`.

Example: each time when `npm run db migrate` is run, after the migration was successfully applied, this will create new records of a specific table if it is empty.

If `options` is an array of multiple database configs, callbacks are run for each of the databases.

```ts
rakeDb(options, {
  async afterMigrate(db: Db) {
    const haveRecords = await db('table').exists()
    if (!haveRecords) {
      await db('table').createMany([
        { name: 'one' },
        { name: 'two' },
        { name: 'three' },
      ])
    }
  },
})
```
