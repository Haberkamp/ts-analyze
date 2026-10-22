import type {
  Analysis,
  Cycle,
  Dependency,
  ManualReviewItem,
  MixedBranch,
  ModuleGraph,
  PriorityStep,
} from "./model.js";
import { languageOf } from "./source-file.js";

interface Component {
  readonly files: string[];
  readonly javascript: string[];
  readonly dependencies: Set<number>;
  readonly dependents: Set<number>;
  readonly importers: Set<string>;
  readonly cycle: boolean;
  ready: boolean;
  height: number;
  fixesMixedBranch: boolean;
}

export function analyzeGraph(graph: ModuleGraph, manualReview: readonly ManualReviewItem[]): Analysis {
  const files = [...graph.keys()].sort();
  const successors = new Map(files.map((file) => [file, uniqueTargets(graph.get(file) ?? [])]));
  const components = buildComponents(files, successors);
  const mixedBranches = findMixedBranches(files, graph);

  markMixedBranchClosure(components, mixedBranches, componentIndex(components));

  return {
    summary: {
      files: files.length,
      javascript: files.filter((file) => languageOf(file) === "javascript").length,
      typescript: files.filter((file) => languageOf(file) === "typescript").length,
    },
    priority: prioritize(components),
    cycles: components
      .filter((component) => component.cycle)
      .map((component) => describeCycle(component.files, successors))
      .sort((left, right) => compareText(left.files[0], right.files[0])),
    mixedBranches,
    manualReview: [...manualReview].sort(
      (left, right) => compareText(left.file, right.file) || left.line - right.line,
    ),
  };
}

function uniqueTargets(dependencies: readonly Dependency[]): string[] {
  return [...new Set(dependencies.map((dependency) => dependency.file))].sort();
}

/** Strongly connected components in dependency-first order, enriched with migration facts. */
function buildComponents(files: string[], successors: Map<string, string[]>): Component[] {
  const groups = stronglyConnectedComponents(files, (file) => successors.get(file) ?? []);
  const indexByFile = new Map<string, number>();
  groups.forEach((group, index) => group.forEach((file) => indexByFile.set(file, index)));

  const components = groups.map((group): Component => {
    const sorted = [...group].sort();
    return {
      files: sorted,
      javascript: sorted.filter((file) => languageOf(file) === "javascript"),
      dependencies: new Set(),
      dependents: new Set(),
      importers: new Set(),
      cycle: sorted.length > 1 || (successors.get(sorted[0] ?? "") ?? []).includes(sorted[0] ?? ""),
      ready: true,
      height: 0,
      fixesMixedBranch: false,
    };
  });

  components.forEach((component, index) => {
    for (const file of component.files) {
      for (const target of successors.get(file) ?? []) {
        const targetIndex = indexByFile.get(target);
        if (targetIndex === undefined || targetIndex === index) {
          continue;
        }
        const targetComponent = components[targetIndex];
        if (targetComponent === undefined) {
          continue;
        }
        component.dependencies.add(targetIndex);
        targetComponent.dependents.add(index);
        targetComponent.importers.add(file);
        if (languageOf(target) === "javascript") {
          component.ready = false;
        }
      }
    }
    // Tarjan emits dependencies before dependents, so their heights are already known.
    for (const dependency of component.dependencies) {
      component.height = Math.max(component.height, (components[dependency]?.height ?? 0) + 1);
    }
  });

  return components;
}

function componentIndex(components: Component[]): Map<string, number> {
  const index = new Map<string, number>();
  components.forEach((component, position) => component.files.forEach((file) => index.set(file, position)));
  return index;
}

function findMixedBranches(files: string[], graph: ModuleGraph): MixedBranch[] {
  const branches: MixedBranch[] = [];
  for (const file of files) {
    if (languageOf(file) !== "typescript") {
      continue;
    }
    // One entry per imported file: its first import.
    const firstImports = new Map<string, Dependency>();
    for (const dependency of graph.get(file) ?? []) {
      const first = firstImports.get(dependency.file);
      if (languageOf(dependency.file) === "javascript" && (first === undefined || dependency.line < first.line)) {
        firstImports.set(dependency.file, dependency);
      }
    }
    if (firstImports.size > 0) {
      const imports = [...firstImports.values()].sort(
        (left, right) => left.line - right.line || compareText(left.file, right.file),
      );
      branches.push({ file, imports });
    }
  }
  return branches;
}

/** Marks every component that must be migrated before the JavaScript imported by TypeScript can be. */
function markMixedBranchClosure(
  components: Component[],
  mixedBranches: MixedBranch[],
  indexByFile: Map<string, number>,
): void {
  const pending = mixedBranches.flatMap((branch) =>
    branch.imports.map((dependency) => indexByFile.get(dependency.file) ?? -1),
  );
  while (pending.length > 0) {
    const component = components[pending.pop() ?? -1];
    if (component === undefined || component.fixesMixedBranch) {
      continue;
    }
    component.fixesMixedBranch = true;
    pending.push(...component.dependencies);
  }
}

/**
 * Topological order (dependencies first). Among steps that are available, prefer steps that
 * fix mixed branches, then shallower steps, then widely imported ones, then by path.
 * Components without JavaScript are already migrated: they are passed through immediately.
 */
function prioritize(components: Component[]): PriorityStep[] {
  const remaining = components.map((component) => component.dependencies.size);
  const available = new Heap<number>((left, right) => compareSteps(components[left], components[right]));
  const migrated: number[] = [];
  const steps: PriorityStep[] = [];

  const release = (index: number): void => {
    if (components[index]?.javascript.length) {
      available.push(index);
    } else {
      migrated.push(index);
    }
  };
  const complete = (index: number): void => {
    for (const dependent of components[index]?.dependents ?? []) {
      remaining[dependent] = (remaining[dependent] ?? 0) - 1;
      if (remaining[dependent] === 0) {
        release(dependent);
      }
    }
  };

  remaining.forEach((count, index) => count === 0 && release(index));
  for (;;) {
    const passThrough = migrated.pop();
    if (passThrough !== undefined) {
      complete(passThrough);
      continue;
    }
    const next = available.pop();
    if (next === undefined) {
      break;
    }
    const component = components[next];
    if (component !== undefined) {
      steps.push({
        files: component.javascript,
        cycle: component.cycle,
        ready: component.ready,
        fixesMixedBranch: component.fixesMixedBranch,
        importedBy: component.importers.size,
      });
    }
    complete(next);
  }
  return steps;
}

function compareSteps(left: Component | undefined, right: Component | undefined): number {
  if (left === undefined || right === undefined) {
    return 0;
  }
  return (
    Number(right.fixesMixedBranch) - Number(left.fixesMixedBranch) ||
    left.height - right.height ||
    right.importers.size - left.importers.size ||
    compareText(left.javascript[0], right.javascript[0])
  );
}

function describeCycle(files: string[], successors: Map<string, string[]>): Cycle {
  const members = new Set(files);
  const start = files[0] ?? "";
  const previous = new Map<string, string>();
  const queue = [start];

  for (let position = 0; position < queue.length; position += 1) {
    const current = queue[position] ?? "";
    for (const next of successors.get(current) ?? []) {
      if (next === start) {
        const path = [current];
        while (path[0] !== start) {
          path.unshift(previous.get(path[0] ?? "") ?? start);
        }
        return { files, path: [...path, start] };
      }
      if (members.has(next) && !previous.has(next)) {
        previous.set(next, current);
        queue.push(next);
      }
    }
  }
  return { files, path: [start, start] };
}

/** Iterative Tarjan: components come out with dependencies before dependents. */
function stronglyConnectedComponents(nodes: string[], successorsOf: (node: string) => string[]): string[][] {
  const index = new Map<string, number>();
  const lowLink = new Map<string, number>();
  const stack: string[] = [];
  const onStack = new Set<string>();
  const components: string[][] = [];
  let nextIndex = 0;

  const open = (node: string): void => {
    index.set(node, nextIndex);
    lowLink.set(node, nextIndex);
    nextIndex += 1;
    stack.push(node);
    onStack.add(node);
  };

  for (const root of nodes) {
    if (index.has(root)) {
      continue;
    }
    open(root);
    const frames = [{ node: root, successors: successorsOf(root), position: 0 }];
    while (frames.length > 0) {
      const frame = frames[frames.length - 1];
      if (frame === undefined) {
        break;
      }
      const successor = frame.successors[frame.position];
      if (successor !== undefined) {
        frame.position += 1;
        if (!index.has(successor)) {
          open(successor);
          frames.push({ node: successor, successors: successorsOf(successor), position: 0 });
        } else if (onStack.has(successor)) {
          lowLink.set(frame.node, Math.min(lowLink.get(frame.node) ?? 0, index.get(successor) ?? 0));
        }
        continue;
      }
      frames.pop();
      const parent = frames[frames.length - 1];
      if (parent !== undefined) {
        lowLink.set(parent.node, Math.min(lowLink.get(parent.node) ?? 0, lowLink.get(frame.node) ?? 0));
      }
      if (lowLink.get(frame.node) === index.get(frame.node)) {
        const component: string[] = [];
        let member: string | undefined;
        do {
          member = stack.pop();
          if (member !== undefined) {
            onStack.delete(member);
            component.push(member);
          }
        } while (member !== undefined && member !== frame.node);
        components.push(component);
      }
    }
  }
  return components;
}

function compareText(left = "", right = ""): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

class Heap<T> {
  private readonly items: T[] = [];

  constructor(private readonly compare: (left: T, right: T) => number) {}

  push(item: T): void {
    const items = this.items;
    items.push(item);
    let child = items.length - 1;
    while (child > 0) {
      const parent = (child - 1) >> 1;
      if (this.compare(items[child] as T, items[parent] as T) >= 0) {
        break;
      }
      [items[child], items[parent]] = [items[parent] as T, items[child] as T];
      child = parent;
    }
  }

  pop(): T | undefined {
    const items = this.items;
    const top = items[0];
    const last = items.pop();
    if (items.length === 0 || last === undefined) {
      return top;
    }
    items[0] = last;
    let parent = 0;
    for (;;) {
      const left = parent * 2 + 1;
      const right = left + 1;
      let smallest = parent;
      if (left < items.length && this.compare(items[left] as T, items[smallest] as T) < 0) {
        smallest = left;
      }
      if (right < items.length && this.compare(items[right] as T, items[smallest] as T) < 0) {
        smallest = right;
      }
      if (smallest === parent) {
        return top;
      }
      [items[parent], items[smallest]] = [items[smallest] as T, items[parent] as T];
      parent = smallest;
    }
  }
}
