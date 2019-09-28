// rollup.config.js
import typescript from 'rollup-plugin-typescript2';
import resolve from 'rollup-plugin-node-resolve';
import builtins from 'rollup-plugin-node-builtins';

export default [{
  input: './src/index.ts',
  output: [
    {
      file: 'build/index.js',
      exports: 'named',
      sourcemap: true,
      format: 'cjs'
    },
    {
      file: 'build/index.esm.js',
      exports: 'named',
      sourcemap: true,
      format: 'esm'
    }
  ],
  external: ['events'],
  plugins: [
    resolve({
      preferBuiltins: true
    }),
    typescript()
	]
}, {
  input: './src/index.ts',
  output: {
    file: 'build/index.umd.js',
    name: 'EMScriptenWrapper',
    exports: 'named',
    format: 'umd'
  },
  plugins: [
    builtins(),
    resolve({
      preferBuiltins: false
    }),
		typescript()
	]
}]
