import { BombaAdapter } from "./bomba.js";
import { DarwinAdapter } from "./darwin.js";
import { EnterAdapter } from "./enter.js";
import { MaximumAdapter } from "./maximum.js";
import { SmartAdapter } from "./smart.js";
import { UltraAdapter } from "./ultra.js";
import { XstoreAdapter } from "./xstore.js";

export const ADAPTERS = {
  smart: new SmartAdapter(),
  bomba: new BombaAdapter(),
  maximum: new MaximumAdapter(),
  xstore: new XstoreAdapter(),
  enter: new EnterAdapter(),
  darwin: new DarwinAdapter(),
  ultra: new UltraAdapter()
};
