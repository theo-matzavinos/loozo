import { test, expect } from "playwright/test";
import { assertReferences, captureReferences, installObservation } from "./observation.js";
import type { Page } from "playwright/test";

async function capture(page: Page): Promise<void> {
  await installObservation(page);
  await page.goto("data:text/html,<!doctype html><title>Native observer calibration</title>");
  await page.setContent(`
    <section data-unit="A"><div data-testid="presence" data-present id="a-host">
      <span data-testid="child" id="a-child">A</span>
    </div></section>
    <section data-unit="B"><div data-testid="presence" data-present id="b-host">
      <span data-testid="child" id="b-child">B</span>
    </div></section>
  `);
  await captureReferences(page);
}

async function journal(page: Page) {
  return page.evaluate(() => {
    const observation = window.acceptanceObservation;

    observation.flushRetention();

    return {
      removed: observation.removed,
      duplicateIds: observation.duplicateIds,
      duplicateLabels: observation.duplicateLabels,
      entered: observation.entered,
    };
  });
}

test.beforeEach(async ({ page }) => capture(page));

test.afterEach(async ({ browser }, info) => {
  await info.attach("native-calibration-engine", {
    body: JSON.stringify(
      {
        project: info.project.name,
        engine: info.project.use.browserName,
        version: browser.version(),
        productQualification: false,
      },
      null,
      2,
    ),
    contentType: "application/json",
  });
});

for (const wrapped of [false, true]) {
  test(`native same-turn wrapper=${wrapped} insertion/removal retains target ownership`, async ({
    page,
  }, info) => {
    const final = await page.evaluate((useWrapper) => {
      const owner = document.querySelector('[data-unit="A"]')!;
      const duplicate = document.querySelector("#a-child")!.cloneNode(true);
      let inserted: Node = duplicate;

      if (useWrapper) {
        const wrapper = document.createElement("div");
        const inner = document.createElement("div");

        inner.append(duplicate);
        wrapper.append(inner);
        inserted = wrapper;
      }

      owner.append(inserted);
      owner.removeChild(inserted);

      // Delivery-time closest() now has no unit ancestry. Attribute removal and
      // dismantling the detached wrapper must not erase the earlier evidence.
      if (duplicate instanceof Element) {
        duplicate.removeAttribute("data-testid");
        duplicate.removeAttribute("id");
        duplicate.remove();
      }

      return document.querySelectorAll("#a-child").length;
    }, wrapped);

    expect(final).toBe(1);
    expect(await journal(page)).toEqual({
      removed: [],
      duplicateIds: ["a-child"],
      duplicateLabels: ["A:child:0"],
      entered: [],
    });
    await expect(assertReferences(page, info)).rejects.toThrow();
  });
}

for (const dismantled of [false, true]) {
  test(`exact native removed wrapper dismantled=${dismantled} retains duplicate ID and testID`, async ({
    page,
  }, info) => {
    const final = await page.evaluate((dismantle) => {
      const unit = document.querySelector('[data-unit="A"]')!;
      const original = document.querySelector("#a-child")!;
      const originalParent = original.parentNode;
      const duplicate = original.cloneNode(true);
      const wrapper = document.createElement("div");

      wrapper.append(duplicate);
      unit.append(wrapper);

      if (dismantle) {
        wrapper.firstChild!.remove();
      }

      wrapper.remove();

      return {
        originalConnected: original.isConnected,
        originalParentRetained: original.parentNode === originalParent,
        originalId: original.id,
        originalTestId: original.getAttribute("data-testid"),
        connectedIdCount: document.querySelectorAll("#a-child").length,
        connectedLabelCount: unit.querySelectorAll('[data-testid="child"]').length,
        wrapperConnected: wrapper.isConnected,
        wrapperChildren: wrapper.childNodes.length,
      };
    }, dismantled);

    let wrapperChildren = 1;

    if (dismantled) {
      wrapperChildren = 0;
    }

    expect(final).toEqual({
      originalConnected: true,
      originalParentRetained: true,
      originalId: "a-child",
      originalTestId: "child",
      connectedIdCount: 1,
      connectedLabelCount: 1,
      wrapperConnected: false,
      wrapperChildren,
    });
    expect(await journal(page)).toEqual({
      removed: [],
      duplicateIds: ["a-child"],
      duplicateLabels: ["A:child:0"],
      entered: [],
    });
    await expect(assertReferences(page, info)).rejects.toThrow();
  });
}

test("dismantled wrong-scope wrapper does not copy an original unit's testID ownership", async ({
  page,
}, info) => {
  await page.evaluate(() => {
    window.acceptanceObservation.stopRetention();
    document.querySelector("#a-child")!.setAttribute("data-testid", "a-only");
  });
  await captureReferences(page);

  const final = await page.evaluate(() => {
    const original = document.querySelector("#a-child")!;
    const originalParent = original.parentNode;
    const duplicate = original.cloneNode(true) as Element;
    const wrapper = document.createElement("div");

    // IDs are document-wide; use a distinct genuine ID to isolate scoped label ownership.
    duplicate.id = "wrong-scope-copy";
    wrapper.append(duplicate);
    document.querySelector('[data-unit="B"]')!.append(wrapper);
    wrapper.firstChild!.remove();
    wrapper.remove();

    return {
      originalConnected: original.isConnected,
      originalParentRetained: original.parentNode === originalParent,
      originalLabel: original.getAttribute("data-testid"),
      copiesConnected: document.querySelectorAll('[data-testid="a-only"]').length,
    };
  });

  expect(final).toEqual({
    originalConnected: true,
    originalParentRetained: true,
    originalLabel: "a-only",
    copiesConnected: 1,
  });
  expect(await journal(page)).toEqual({
    removed: [],
    duplicateIds: [],
    duplicateLabels: [],
    entered: [],
  });
  await assertReferences(page, info);
});

test("native old attribute values preserve both identities before wrapper dismantling", async ({
  page,
}, info) => {
  const final = await page.evaluate(() => {
    const original = document.querySelector("#a-child")!;
    const originalParent = original.parentNode;
    const duplicate = original.cloneNode(true) as Element;
    const wrapper = document.createElement("div");

    wrapper.append(duplicate);
    document.querySelector('[data-unit="A"]')!.append(wrapper);
    duplicate.id = "renamed-copy";
    duplicate.setAttribute("data-testid", "renamed-copy");
    duplicate.removeAttribute("id");
    duplicate.removeAttribute("data-testid");
    wrapper.firstChild!.remove();
    wrapper.remove();

    return {
      originalConnected: original.isConnected,
      originalParentRetained: original.parentNode === originalParent,
      originalId: original.id,
      originalLabel: original.getAttribute("data-testid"),
      duplicateId: duplicate.getAttribute("id"),
      duplicateLabel: duplicate.getAttribute("data-testid"),
      wrapperChildren: wrapper.childNodes.length,
    };
  });

  expect(final).toEqual({
    originalConnected: true,
    originalParentRetained: true,
    originalId: "a-child",
    originalLabel: "child",
    duplicateId: null,
    duplicateLabel: null,
    wrapperChildren: 0,
  });
  expect(await journal(page)).toEqual({
    removed: [],
    duplicateIds: ["a-child"],
    duplicateLabels: ["A:child:0"],
    entered: [],
  });
  await expect(assertReferences(page, info)).rejects.toThrow();
});

test("removed original wrapper dismantling retains removal despite exact final restoration", async ({
  page,
}, info) => {
  await page.evaluate(() => {
    window.acceptanceObservation.stopRetention();

    const original = document.querySelector("#a-child")!;
    const wrapper = document.createElement("div");

    original.parentNode!.insertBefore(wrapper, original);
    wrapper.append(original);
  });
  await captureReferences(page);

  const final = await page.evaluate(() => {
    const original = document.querySelector("#a-child")!;
    const wrapper = original.parentElement!;
    const wrapperParent = wrapper.parentNode!;

    wrapper.remove();
    wrapper.firstChild!.remove();
    wrapper.append(original);
    wrapperParent.appendChild(wrapper);

    return {
      originalConnected: original.isConnected,
      originalParentRetained: original.parentNode === wrapper,
      wrapperParentRetained: wrapper.parentNode === wrapperParent,
      originalId: original.id,
      originalLabel: original.getAttribute("data-testid"),
    };
  });

  expect(final).toEqual({
    originalConnected: true,
    originalParentRetained: true,
    wrapperParentRetained: true,
    originalId: "a-child",
    originalLabel: "child",
  });
  expect(await journal(page)).toEqual({
    removed: ["A:child:0"],
    duplicateIds: [],
    duplicateLabels: [],
    entered: [],
  });
  await expect(assertReferences(page, info)).rejects.toThrow();
});

test("identical labels in sibling and newly mounted units are not duplicates", async ({
  page,
}, info) => {
  await page.evaluate(() => {
    const sibling = document.createElement("section");

    sibling.setAttribute("data-unit", "C");

    const child = document.createElement("span");

    child.setAttribute("data-testid", "child");
    sibling.append(child);
    document.body.append(sibling);
    sibling.remove();
  });
  expect(await journal(page)).toEqual({
    removed: [],
    duplicateIds: [],
    duplicateLabels: [],
    entered: [],
  });
  await assertReferences(page, info);
});

test("record owner is not replaced by a duplicate's later sibling ancestry", async ({ page }) => {
  await page.evaluate(() => {
    const duplicate = document.createElement("span");

    duplicate.setAttribute("data-testid", "child");

    const a = document.querySelector('[data-unit="A"]')!;
    const b = document.querySelector('[data-unit="B"]')!;

    a.append(duplicate);
    duplicate.remove();
    b.append(duplicate);
    duplicate.remove();
  });
  expect(await journal(page)).toEqual({
    removed: [],
    duplicateIds: [],
    duplicateLabels: ["A:child:0", "B:child:0"],
    entered: [],
  });
});

test("captured original labels and scope nodes survive same-turn scope relabeling", async ({
  page,
}) => {
  await page.evaluate(() => {
    const a = document.querySelector('[data-unit="A"]')!;
    const b = document.querySelector('[data-unit="B"]')!;

    a.setAttribute("data-unit", "B");

    const duplicate = document.createElement("span");

    duplicate.setAttribute("data-testid", "child");
    b.append(duplicate);
    duplicate.remove();
    a.setAttribute("data-unit", "A");
  });
  expect(await journal(page)).toEqual({
    removed: [],
    duplicateIds: [],
    duplicateLabels: ["B:child:0"],
    entered: [],
  });
});

test("same-turn entering set/remove is observed without discovery or a final marker", async ({
  page,
}, info) => {
  const final = await page.evaluate(() => {
    const host = document.querySelector("#a-host")!;

    host.setAttribute("data-entering", "");
    host.removeAttribute("data-entering");

    return {
      entering: host.hasAttribute("data-entering"),
      discoveries: window.acceptanceObservation.discoveries.length,
    };
  });

  expect(final).toEqual({ entering: false, discoveries: 0 });
  expect(await journal(page)).toEqual({
    removed: [],
    duplicateIds: [],
    duplicateLabels: [],
    entered: ["A:presence:0"],
  });
  await expect(assertReferences(page, info)).rejects.toThrow();
});

test("same-turn ancestor removal plus dismantling retains original child removal evidence", async ({
  page,
}) => {
  await page.evaluate(() => {
    const host = document.querySelector("#a-host")!;
    const child = document.querySelector("#a-child")!;
    const owner = host.parentNode!;

    host.remove();
    host.removeChild(child);
    host.append(child);
    owner.appendChild(host);
  });
  expect(await journal(page)).toEqual({
    removed: ["A:presence:0", "A:child:0"],
    duplicateIds: [],
    duplicateLabels: [],
    entered: [],
  });
});

test("original testID relabeling cannot hide a transient copy in the captured scope", async ({
  page,
}) => {
  await page.evaluate(() => {
    const original = document.querySelector("#a-child")!;

    original.setAttribute("data-testid", "temporarily-renamed");

    const duplicate = document.createElement("span");

    duplicate.setAttribute("data-testid", "child");
    original.parentNode!.appendChild(duplicate);
    duplicate.remove();
    original.setAttribute("data-testid", "child");
  });
  expect(await journal(page)).toEqual({
    removed: [],
    duplicateIds: [],
    duplicateLabels: ["A:child:0"],
    entered: [],
  });
});

test("an entering marker already present at capture is not accepted as a settled baseline", async ({
  page,
}, info) => {
  await page.evaluate(() => {
    window.acceptanceObservation.stopRetention();
    document.querySelector("#a-host")!.setAttribute("data-entering", "");
  });
  await captureReferences(page);
  expect((await journal(page)).entered).toEqual(["A:presence:0"]);
  await expect(assertReferences(page, info)).rejects.toThrow();
});

test("native takeRecords flush at stop keeps undelivered same-turn entrance evidence", async ({
  page,
}) => {
  await page.evaluate(() => {
    const host = document.querySelector("#b-host")!;

    host.setAttribute("data-entering", "");
    host.removeAttribute("data-entering");
    window.acceptanceObservation.stopRetention();
  });
  expect(await journal(page)).toEqual({
    removed: [],
    duplicateIds: [],
    duplicateLabels: [],
    entered: ["B:presence:0"],
  });
});
