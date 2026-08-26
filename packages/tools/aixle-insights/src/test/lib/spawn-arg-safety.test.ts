import { describe, it, expect } from "vitest";
import { isSafeSshHost, isSafeSpawnPathArg } from "../../lib/spawn-arg-safety.js";

describe("isSafeSshHost", () => {
  it.each([
    ["github.com"],
    ["github-work"],
    ["gitlab.example.co.uk"],
    ["internal_host"],
    ["192.168.1.10"],
    ["g"],
  ])("accepts the legitimate host %s", (host) => {
    expect(isSafeSshHost(host)).toBe(true);
  });

  it.each([
    ["-oProxyCommand=id"],
    ["-F/tmp/evil_ssh_config"],
    ["-E/tmp/log"],
    ["--"],
    ["bad host"],
    ["host=value"],
    ["host'quoted"],
    ['host"quoted'],
    ["host\nhostname evil.com"],
    ["host\\backslash"],
    ["-"],
    [""],
    ["trailing-"],
  ])("rejects the option-shaped or malformed host %j", (host) => {
    expect(isSafeSshHost(host)).toBe(false);
  });

  it("rejects a host longer than 255 characters", () => {
    expect(isSafeSshHost("a".repeat(256))).toBe(false);
  });

  it("accepts a host of exactly 255 characters", () => {
    expect(isSafeSshHost("a".repeat(255))).toBe(true);
  });
});

describe("isSafeSpawnPathArg", () => {
  it.each([
    ["/Users/dev/repos/thing"],
    ["C:\\Users\\dev\\repos\\thing"],
    ["./relative/path"],
    ["/path/with -dash/inside"],
    ["/path/with spaces"],
  ])("accepts the ordinary path %j", (value) => {
    expect(isSafeSpawnPathArg(value)).toBe(true);
  });

  it.each([
    ["--upload-pack=touch /tmp/pwn"],
    ["-c"],
    ["--exec-path=/tmp"],
    ["-"],
    [""],
    ["/valid/path\0/tmp"],
  ])("rejects the option-shaped or malformed path %j", (value) => {
    expect(isSafeSpawnPathArg(value)).toBe(false);
  });
});
