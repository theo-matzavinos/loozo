import { mergeApplicationConfig } from "@angular/core";
import { HttpBackend } from "@angular/common/http";
import { provideServerRendering, withRoutes } from "@angular/ssr";
import { config } from "./config";
import { DirectRpcBackend } from "./backend.server";
import { rendering } from "./rendering";

export const serverConfig = mergeApplicationConfig(config, {
  providers: [
    provideServerRendering(withRoutes(rendering)),
    { provide: HttpBackend, useClass: DirectRpcBackend },
  ],
});
