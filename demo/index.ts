import createWrapper, {IAsyncEMWWrapper, IEMWMainPromise, IEMWMain, IEMScriptModule} from '../src';

export interface IHelloWorldFunctions {
  add_values(a: number, b: number): number;
}

export interface IHelloWorldModule extends IAsyncEMWWrapper<IHelloWorldFunctions>, IEMWMainPromise {

}


const wrapper: IHelloWorldModule = createWrapper<IHelloWorldFunctions>(() => <Promise<IEMScriptModule>><unknown>import('./helloworld'), {
  functions: {
    add_values: {
      arguments: ['number', 'number'],
      returnType: 'number'
    }
  }
});

export default wrapper;
