import { type IModule } from 'dependency-cruiser';

export default interface DependencyCounterInterface {
	countDependencies(module: IModule, allModules: IModule[]): number;
}
