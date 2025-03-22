import { NgDocPage } from '@ng-doc/core';
import components from '../ng-doc.category';
import { RadianProgress, RadianProgressImports } from '@loozo/radian/progress';

const progress: NgDocPage = {
  title: `Progress`,
  mdFile: './index.md',
  category: components,
  imports: [RadianProgressImports],
  playgrounds: {
    ProgressPlayground: {
      target: RadianProgress,
      template: `
        <div radianProgress>
          <div radianProgressIndicator style="height: 2rem; background-color: red;">
          </div>
        </div>
        `,
    },
  },
};

export default progress;
