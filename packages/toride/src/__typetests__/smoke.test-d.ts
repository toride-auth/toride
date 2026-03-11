import { expectAssignable } from "tsd";
import { VERSION } from "../../dist/index.js";

// Smoke test: verify tsd infrastructure works by checking a known export
expectAssignable<string>(VERSION);
