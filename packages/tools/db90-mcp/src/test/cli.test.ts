import { describe, it, expect } from "vitest";
import { parseArgs } from "../cli.js";

describe("parseArgs", () => {
  it("defaults to run when no command is given", () => {
    expect(parseArgs(["node", "cli.js"]).command).toBe("run");
  });

  it("recognises run / init / health subcommands", () => {
    expect(parseArgs(["node", "cli.js", "run"]).command).toBe("run");
    expect(parseArgs(["node", "cli.js", "init"]).command).toBe("init");
    expect(parseArgs(["node", "cli.js", "health"]).command).toBe("health");
  });

  it("maps serve to run for backward compatibility", () => {
    expect(parseArgs(["node", "cli.js", "serve"]).command).toBe("run");
  });

  it("treats unknown commands as help", () => {
    expect(parseArgs(["node", "cli.js", "frobnicate"]).command).toBe("help");
  });

  it("recognises --help and -h", () => {
    expect(parseArgs(["node", "cli.js", "--help"]).command).toBe("help");
    expect(parseArgs(["node", "cli.js", "-h"]).command).toBe("help");
    expect(parseArgs(["node", "cli.js", "health", "--help"]).help).toBe(true);
  });
});
