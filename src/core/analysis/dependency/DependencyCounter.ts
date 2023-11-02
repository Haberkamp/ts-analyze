import { type IModule } from 'dependency-cruiser';
import type DependencyCounterInterface from './DependencyCounterInterface.js';

export default class DependencyCounter implements DependencyCounterInterface {
	countDependencies(module: IModule, allModules: IModule[]) {
		const dependencies = this.analyze(module, allModules);
		const deDuplicatedDependencies = new Set(dependencies).size;

		return deDuplicatedDependencies;
	}

	private analyze(module: IModule, allModules: IModule[]): string[] {
		return module.dependencies.reduce<string[]>((accumulator, dependency) => {
			const dependenciesOfDependency = allModules.filter(
				(currentModule) => currentModule.source === dependency.resolved,
			);

			const result = dependenciesOfDependency.reduce<string[]>(
				(accumulator, currentModule) => {
					const deps = this.analyze(currentModule, allModules);

					return [...accumulator, ...deps];
				},
				[],
			);

			return [...accumulator, dependency.resolved, ...result];
		}, []);
	}
}
