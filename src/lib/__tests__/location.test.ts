import { describe, expect, it } from "vitest";

import { locationOf } from "../location";

describe("locationOf", () => {
  it("treats a blank URL as unset", () => {
    expect(locationOf("")).toBe("unset");
    expect(locationOf("   ")).toBe("unset");
  });

  it("recognizes loopback and docker-host hostnames as local", () => {
    expect(locationOf("http://127.0.0.1:8082")).toBe("local");
    expect(locationOf("http://localhost:8082")).toBe("local");
    expect(locationOf("http://host.docker.internal:8082")).toBe("local");
    expect(locationOf("http://my-machine.local:8082")).toBe("local");
  });

  it("treats any other hostname as remote", () => {
    expect(locationOf("https://classifier.qa.example.internal")).toBe("remote");
  });

  it("errs towards remote for an unparsable URL", () => {
    expect(locationOf("not a url")).toBe("remote");
  });
});
