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

  for (const iconName in icons) {
    const iconJsDocEndIndex = declarationFile.indexOf(
      `declare const ${iconName}`,
    );
    const iconJsDocStartIndex = declarationFile
      .subarray(0, iconJsDocEndIndex)
      .lastIndexOf('/**');
    const iconJsDoc = declarationFile
      .subarray(iconJsDocStartIndex, iconJsDocEndIndex)
      .toString();

    if (/@deprecated/.test(iconJsDoc)) {
      continue;
    }

    const icon = icons[iconName]
      .replace(/width="\d+"/, '')
      .replace(/height="\d+"/, '');
    const [, preview] = /@preview (.+)\n/.exec(iconJsDoc);
    const [, docs] = /@see (.+)\n/.exec(iconJsDoc);

    generateFiles(
      tree,
      path.join(__dirname, 'files'),
      './libs/lucide/src/lib',
      {
        tmpl: '',
        ...names(iconName),
        icon,
        preview,
        docs,
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
