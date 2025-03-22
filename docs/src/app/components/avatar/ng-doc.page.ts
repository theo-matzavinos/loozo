import { NgDocPage } from '@ng-doc/core';
import components from '../ng-doc.category';
import { RadianAvatar, RadianAvatarImports } from '@loozo/radian/avatar';

const avatar: NgDocPage = {
  title: `Avatar`,
  mdFile: './index.md',
  category: components,
  imports: [RadianAvatarImports],
  playgrounds: {
    AvatarPlayground: {
      target: RadianAvatar,
      template: `
            <div radianAvatar>
              <img radianAvatarImage src="https://avatar.iran.liara.run/public" />
              <div *radianAvatarFallback="500">User</div>
            </div>
          `,
    },
  },
};

export default avatar;
