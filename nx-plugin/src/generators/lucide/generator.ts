import { formatFiles, generateFiles, names, Tree } from '@nx/devkit';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import * as icons from 'lucide-static';

export default async function (tree: Tree) {
  const declarationFile = await fs.readFile(
    path.join(
      __dirname,
      '../../../../node_modules/lucide-static/dist/lucide-static.d.ts',
    ),
  );
  const deprecatedMatches = declarationFile
    .toString()
    .matchAll(/@deprecated.+\n.+\n\s*declare const (.+):/gm);
  const deprecated = [];

  for (const match of deprecatedMatches) {
    deprecated.push(match[1]);
  }

  for (const iconName in icons) {
    if (deprecated.includes(iconName)) {
      continue;
    }

    const icon = icons[iconName];

    generateFiles(
      tree,
      path.join(__dirname, 'files'),
      './libs/lucide/src/lib',
      {
        tmpl: '',
        ...names(iconName),
        icon,
      },
    );
  }

  const iconsFiles = tree.children('libs/lucide/src/lib');

  tree.write(
    'libs/lucide/src/index.ts',
    iconsFiles
      .map((f) => `export * from './lib/${f.replace('.ts', '')}';`)
      .join('\n'),
  );

  await formatFiles(tree);
}
