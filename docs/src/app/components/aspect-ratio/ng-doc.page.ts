import { NgDocPage } from '@ng-doc/core';
import components from '../ng-doc.category';
import {
  RadianAspectRatio,
  RadianAspectRatioImports,
} from '@loozo/radian/aspect-ratio';

const aspectRatio: NgDocPage = {
  title: `Aspect Ratio`,
  mdFile: './index.md',
  category: components,
  imports: [RadianAspectRatioImports],
  playgrounds: {
    AspectRatioPlayground: {
      target: RadianAspectRatio,
      template: `
          <div radianAspectRatio>
            <div style="background-color: red;" radianAspectRatioContent></div>
          </div>
        `,
    },
  },
};

export default aspectRatio;
