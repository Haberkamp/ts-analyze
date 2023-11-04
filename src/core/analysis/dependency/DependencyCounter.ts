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
			const dependenciesOfDependency = allModules.filter((currentModule) => {
				const isDependencyOfDependency =
					currentModule.source === dependency.resolved;

				const isJavaScriptDependency = dependency.resolved.endsWith('.js');

				return isDependencyOfDependency && isJavaScriptDependency;
			});

			const result = dependenciesOfDependency.reduce<string[]>(
				(accumulator, currentModule) => {
					const deps = this.analyze(currentModule, allModules);

					return [...accumulator, ...deps];
				},
				[],
			);

			const isJavaScriptDependency = dependency.resolved.endsWith('.js');
			if (isJavaScriptDependency) {
				return [...accumulator, dependency.resolved, ...result];
			}

			return [...accumulator, ...result];
		}, []);
	}
}
