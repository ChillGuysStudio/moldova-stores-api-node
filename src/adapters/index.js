import { BombaAdapter } from "./bomba.js";
import { DarwinAdapter } from "./darwin.js";
import { EnterAdapter } from "./enter.js";
import { MaximumAdapter } from "./maximum.js";
import { SmartAdapter } from "./smart.js";
import { UltraAdapter } from "./ultra.js";

export const ADAPTERS = {
  smart: new SmartAdapter(),
  bomba: new BombaAdapter(),
  maximum: new MaximumAdapter(),
  enter: new EnterAdapter(),
  darwin: new DarwinAdapter(),
  ultra: new UltraAdapter()
};
