import { updateMainFile } from './updateMainFile';
import * as path from 'path';
import * as fs from 'fs/promises';
import { asMock, ast, makeTestWritten, tablePath } from './testUtils';

jest.mock('fs/promises', () => ({
  readFile: jest.fn(),
  writeFile: jest.fn(),
  mkdir: jest.fn(),
}));

const mainFilePath = path.resolve('db.ts');
const testWritten = makeTestWritten(mainFilePath);
const options = { databaseURL: 'url' };

describe('updateMainFile', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  describe('add table', () => {
    it('should create file if not exist and add a table', async () => {
      asMock(fs.readFile).mockRejectedValue(
        Object.assign(new Error(), { code: 'ENOENT' }),
      );

      await updateMainFile(mainFilePath, tablePath, ast.addTable, options);

      expect(asMock(fs.mkdir)).toBeCalledWith(path.dirname(mainFilePath), {
        recursive: true,
      });

      testWritten(`import { orchidORM } from 'orchid-orm';
import { SomeTable } from './tables/some.table';

export const db = orchidORM(
  {
    databaseURL: 'url',
  },
  {
    some: SomeTable,
  }
);
`);
    });

    it('should add table', async () => {
      asMock(fs.readFile).mockResolvedValue(`
import { orchidORM } from 'orchid-orm';

export const db = orchidORM({}, {});
`);

      await updateMainFile(mainFilePath, tablePath, ast.addTable, options);

      testWritten(`
import { orchidORM } from 'orchid-orm';
import { SomeTable } from './tables/some.table';

export const db = orchidORM({}, {
  some: SomeTable,
});
`);
    });

    it('should handle import as', async () => {
      asMock(fs.readFile).mockResolvedValue(`
import { orchidORM as custom } from 'orchid-orm';

export const db = custom({}, {});
`);

      await updateMainFile(mainFilePath, tablePath, ast.addTable, options);

      testWritten(`
import { orchidORM as custom } from 'orchid-orm';
import { SomeTable } from './tables/some.table';

export const db = custom({}, {
  some: SomeTable,
});
`);
    });

    it('should handle object list with elements', async () => {
      asMock(fs.readFile).mockResolvedValue(`
import { orchidORM } from 'orchid-orm';
import { Other } from './tables/other';

export const db = orchidORM({}, {
  other: Other,
});
`);

      await updateMainFile(mainFilePath, tablePath, ast.addTable, options);

      testWritten(`
import { orchidORM } from 'orchid-orm';
import { Other } from './tables/other';
import { SomeTable } from './tables/some.table';

export const db = orchidORM({}, {
  other: Other,
  some: SomeTable,
});
`);
    });

    it('should handle object list without ending coma', async () => {
      asMock(fs.readFile).mockResolvedValue(`
import { orchidORM } from 'orchid-orm';
import { MyTable } from './tables/my.table';

export const db = orchidORM({}, {
  my: MyTable,
});
`);

      await updateMainFile(mainFilePath, tablePath, ast.addTable, options);

      testWritten(`
import { orchidORM } from 'orchid-orm';
import { MyTable } from './tables/my.table';
import { SomeTable } from './tables/some.table';

export const db = orchidORM({}, {
  my: MyTable,
  some: SomeTable,
});
`);
    });

    it('should not add table if it is already added', async () => {
      asMock(fs.readFile).mockResolvedValue(`
import { orchidORM } from 'orchid-orm';
import { SomeTable } from './tables/some.table';

export const db = orchidORM({}, {
  some: SomeTable
});
`);

      await updateMainFile(mainFilePath, tablePath, ast.addTable, options);

      expect(fs.writeFile).not.toBeCalled();
    });
  });

  describe('drop table', () => {
    it('should remove table', async () => {
      asMock(fs.readFile).mockResolvedValue(`
import { orchidORM } from 'orchid-orm';
import { SomeTable } from './tables/some.table';

export const db = orchidORM({}, {
  some: SomeTable,
});
`);

      await updateMainFile(mainFilePath, tablePath, ast.dropTable, options);

      testWritten(`
import { orchidORM } from 'orchid-orm';

export const db = orchidORM({}, {
});
`);
    });

    it('should remove aliased import', async () => {
      asMock(fs.readFile).mockResolvedValue(`
import { orchidORM } from 'orchid-orm';
import { SomeTable as koko } from './tables/some.table';

export const db = orchidORM({}, {
  koko: koko,
});
`);

      await updateMainFile(mainFilePath, tablePath, ast.dropTable, options);

      testWritten(`
import { orchidORM } from 'orchid-orm';

export const db = orchidORM({}, {
});
`);
    });

    it('should remove short form of key and value', async () => {
      asMock(fs.readFile).mockResolvedValue(`
import { orchidORM } from 'orchid-orm';
import { SomeTable as koko } from './tables/some.table';

export const db = orchidORM({}, {
  koko,
});
`);

      await updateMainFile(mainFilePath, tablePath, ast.dropTable, options);

      testWritten(`
import { orchidORM } from 'orchid-orm';

export const db = orchidORM({}, {
});
`);
    });

    it('should not remove other tables', async () => {
      asMock(fs.readFile).mockResolvedValue(`
import { orchidORM } from 'orchid-orm';
import { One } from './tables/one';
import { SomeTable } from './tables/some.table';
import { Two } from './tables/two';

export const db = orchidORM({}, {
  one,
  some: SomeTable,
  two,
});
`);

      await updateMainFile(mainFilePath, tablePath, ast.dropTable, options);

      testWritten(`
import { orchidORM } from 'orchid-orm';
import { One } from './tables/one';
import { Two } from './tables/two';

export const db = orchidORM({}, {
  one,
  two,
});
`);
    });

    it('should not insert table if table with same key exists, disregarding the import path', async () => {
      asMock(fs.readFile).mockResolvedValue(`
import { orchidORM } from 'orchid-orm';
import { X } from './x';

export const db = orchidORM({}, {
  some: X,
});
`);

      await updateMainFile(mainFilePath, tablePath, ast.addTable, options);

      expect(fs.writeFile).not.toBeCalled();
    });
  });
});
