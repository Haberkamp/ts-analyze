import type { DependencyGraph } from "./types.js";

export interface MigrationStep {
  readonly files: string[];
  readonly isCycle: boolean;
}

export interface MigrationPlan {
  readonly steps: MigrationStep[];
  readonly cycles: string[][];
}

export function determineMigrationOrder(graph: DependencyGraph): MigrationPlan {
  const components = findStronglyConnectedComponents(graph);
  const componentByFile = new Map<string, number>();

  components.forEach((component, index) => {
    for (const file of component) {
      componentByFile.set(file, index);
    }
  });

  const componentDependencies = new Map<number, Set<number>>();
  components.forEach((_, index) => componentDependencies.set(index, new Set()));

  for (const [file, dependencies] of graph) {
    const fileComponent = componentByFile.get(file);
    if (fileComponent === undefined) {
      continue;
    }

    for (const dependency of dependencies) {
      const dependencyComponent = componentByFile.get(dependency);
      if (
        dependencyComponent !== undefined &&
        dependencyComponent !== fileComponent
      ) {
        componentDependencies.get(fileComponent)?.add(dependencyComponent);
      }
    }
  }

  const orderedComponentIndexes = topologicalSort(componentDependencies);
  const steps = orderedComponentIndexes.map((index) => {
    const files = [...components[index]].sort();
    return {
      files,
      isCycle:
        files.length > 1 ||
        files.some((file) => graph.get(file)?.has(file) ?? false),
    };
  });

  return {
    steps,
    cycles: steps.filter((step) => step.isCycle).map((step) => step.files),
  };
}

function findStronglyConnectedComponents(graph: DependencyGraph): string[][] {
  const indexByFile = new Map<string, number>();
  const lowLinkByFile = new Map<string, number>();
  const stack: string[] = [];
  const onStack = new Set<string>();
  const components: string[][] = [];
  let nextIndex = 0;

  for (const file of graph.keys()) {
    if (!indexByFile.has(file)) {
      strongConnect(file);
    }
  }

  return components;

  function strongConnect(file: string): void {
    indexByFile.set(file, nextIndex);
    lowLinkByFile.set(file, nextIndex);
    nextIndex += 1;
    stack.push(file);
    onStack.add(file);

    for (const dependency of graph.get(file) ?? []) {
      if (!indexByFile.has(dependency)) {
        strongConnect(dependency);
        lowLinkByFile.set(
          file,
          Math.min(
            lowLinkByFile.get(file) ?? 0,
            lowLinkByFile.get(dependency) ?? 0,
          ),
        );
      } else if (onStack.has(dependency)) {
        lowLinkByFile.set(
          file,
          Math.min(
            lowLinkByFile.get(file) ?? 0,
            indexByFile.get(dependency) ?? 0,
          ),
        );
      }
    }

    if (lowLinkByFile.get(file) !== indexByFile.get(file)) {
      return;
    }

    const component: string[] = [];
    let current: string | undefined;
    do {
      current = stack.pop();
      if (!current) {
        break;
      }
      onStack.delete(current);
      component.push(current);
    } while (current !== file);

    components.push(component);
  }
}

function topologicalSort(graph: Map<number, Set<number>>): number[] {
  const visited = new Set<number>();
  const ordered: number[] = [];

  for (const node of graph.keys()) {
    visit(node);
  }

  return ordered;

  function visit(node: number): void {
    if (visited.has(node)) {
      return;
    }

    visited.add(node);

    for (const dependency of graph.get(node) ?? []) {
      visit(dependency);
    }

    ordered.push(node);
  }
}
