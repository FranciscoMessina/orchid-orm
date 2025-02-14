import { AppCodeUpdater } from 'rake-db';
import * as path from 'path';
import { updateMainFile } from './updateMainFile';
import { updateTableFile } from './updateTableFile/updateTableFile';
import { createBaseTableFile } from './createBaseTableFile';
import { SetOptional } from 'pqb';

export class AppCodeUpdaterError extends Error {}

export type AppCodeUpdaterConfig = {
  tablePath(tableName: string): string;
  baseTablePath: string;
  baseTableName: string;
  mainFilePath: string;
};

export const appCodeUpdater = ({
  tablePath,
  baseTablePath,
  baseTableName,
  mainFilePath,
}: SetOptional<AppCodeUpdaterConfig, 'baseTableName'>): AppCodeUpdater => {
  return async ({ ast, options, basePath, cache: cacheObject }) => {
    const params: AppCodeUpdaterConfig = {
      tablePath(name: string) {
        const file = tablePath(name);
        return resolvePath(basePath, file);
      },
      baseTablePath: resolvePath(basePath, baseTablePath),
      baseTableName: baseTableName || 'BaseTable',
      mainFilePath: resolvePath(basePath, mainFilePath),
    };

    const promises: Promise<void>[] = [
      updateMainFile(params.mainFilePath, params.tablePath, ast, options),
      updateTableFile({ ...params, ast }),
    ];

    const cache = cacheObject as { createdBaseTable?: true };
    if (!cache.createdBaseTable) {
      promises.push(
        createBaseTableFile(params).then(() => {
          cache.createdBaseTable = true;
        }),
      );
    }

    await Promise.all(promises);
  };
};

const resolvePath = (basePath: string, filePath: string) =>
  path.isAbsolute(filePath) ? filePath : path.resolve(basePath, filePath);
