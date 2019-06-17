import createWrapper, {IAsyncEMWMainWrapper} from '../';

export interface IHelloWorldFunctions {
  add_values(a: number, b: number): number;
}

export interface IHelloWorldModule extends IAsyncEMWMainWrapper<IHelloWorldFunctions> {

}

function importNode(file: string) {
  return import('fs').then((fs) => {
    return new Promise<any>((resolve, reject) => {
      fs.readFile(file, (err, data) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength));
      });
    });
  });
}

const wrapper: IHelloWorldModule = createWrapper<IHelloWorldFunctions>({
  module: () => import('./helloworld'),
  data: () => importNode('./helloworld.data'),
  wasm: () => importNode('./helloworld.wasm')
}, {
  functions: {
    add_values: {
      arguments: ['number', 'number'],
      returnType: 'number'
    }
  }
});

// const wrapperASM: IHelloWorldModule = createWrapper<IHelloWorldFunctions>({
//   module: () => import('./helloworld_asm'),
//   data: () => importNode('./helloworld.data')
// }, {
//   functions: {
//     add_values: {
//       arguments: ['number', 'number'],
//       returnType: 'number'
//     }
//   }
// });


export default wrapper;

async function run(w: IHelloWorldModule) {
  w.stdout.on('data', (c) => console.log('stdout', c.trim()));
  w.stderr.on('data', (c) => console.log('stderr', c.trim()));
  console.time('load');
  const s = await w.sync();
  console.timeEnd('load');
  console.time('run');
  console.log(s.run([], 'ABC\n'));
  console.timeEnd('run');
  console.time('run2');
  // reset magic stream closed flags
  s.module.globalCtors!();

  console.log(s.run([], 'DEF\n'));
  console.timeEnd('run2');
}

async function main() {
  console.log('wasm');
  await run(wrapper);
  // console.log('asm');
  // await run(wrapperASM);
}

main();
