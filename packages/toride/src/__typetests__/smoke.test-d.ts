import { expectAssignable } from "tsd";
import { VERSION } from "../index.js";

// Smoke test: verify tsd infrastructure works by checking a known export
expectAssignable<string>(VERSION);
