import createWrapper, {IAsyncEMWMainWrapper} from '../';

export interface IHelloWorldFunctions {
  add_values(a: number, b: number): number;
}

export interface IHelloWorldModule extends IAsyncEMWMainWrapper<IHelloWorldFunctions> {

}

const wrapper: IHelloWorldModule = createWrapper<IHelloWorldFunctions>(() => import('./helloworld'), {
  functions: {
    add_values: {
      arguments: ['number', 'number'],
      returnType: 'number'
    }
  }
});

const wrapperASM: IHelloWorldModule = createWrapper<IHelloWorldFunctions>(() => import('./helloworld_asm'), {
  functions: {
    add_values: {
      arguments: ['number', 'number'],
      returnType: 'number'
    }
  }
});


export default wrapper;

async function run(w: IHelloWorldModule) {
  w.stdout.on('data', (c) => console.log('stdout', c));
  w.stderr.on('data', (c) => console.log('stderr', c));
  console.time('load');
  const s = await w.sync();
  console.timeEnd('load');
  console.time('run');
  console.log(s.main());
  console.timeEnd('run');
}

async function main() {
  console.log('wasm');
  await run(wrapper);
  console.log('asm');
  await run(wrapperASM);
}

main();
