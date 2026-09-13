import { setDefaultResultOrder } from "node:dns";
import { config as loadEnv } from "dotenv";
import { configureEnv } from "./config.js";

loadEnv();
setDefaultResultOrder(process.env.DNS_RESULT_ORDER === "verbatim" ? "verbatim" : "ipv4first");
configureEnv(process.env as Record<string, string | undefined>);
