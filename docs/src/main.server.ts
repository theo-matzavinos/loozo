import { bootstrapApplication } from '@angular/platform-browser';
import { AppRoot } from './app/app-root';
import { config } from './app/app.config.server';

const bootstrap = () => bootstrapApplication(AppRoot, config);

export default bootstrap;
