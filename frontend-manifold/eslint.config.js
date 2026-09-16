const eslint = require('@eslint/js');
const { defineConfig } = require('eslint/config');
const tseslint = require('typescript-eslint');
const angular = require('angular-eslint');

const restrictedAngularCoreImports = [
	'signal',
	'computed',
	'effect',
	'linkedSignal',
	'input',
	'output',
	'model',
];
const noSignalsMessage = 'Signals are not used. Use RxJS observables and ChangeDetectorRef.';

module.exports = defineConfig(
	{
		files: ['**/*.ts'],
		extends: [
			eslint.configs.recommended,
			tseslint.configs.recommended,
			tseslint.configs.stylistic,
			angular.configs.tsRecommended,
		],
		processor: angular.processInlineTemplates,
		rules: {
			'@angular-eslint/directive-selector': [
				'error',
				{ type: 'attribute', prefix: 'app', style: 'camelCase' },
			],
			'@angular-eslint/component-selector': [
				'error',
				{ type: 'element', prefix: 'app', style: 'kebab-case' },
			],
			'@angular-eslint/component-class-suffix': 'error',
			'@angular-eslint/directive-class-suffix': 'error',
			'@angular-eslint/prefer-inject': 'error',
			'@angular-eslint/prefer-on-push-component-change-detection': 'error',
			'@angular-eslint/use-injectable-provided-in': 'error',
			'@angular-eslint/use-lifecycle-interface': 'error',
			'@typescript-eslint/array-type': ['error', { default: 'array' }],
			'@typescript-eslint/no-explicit-any': 'error',
			'@typescript-eslint/no-shadow': 'error',
			eqeqeq: ['error', 'always'],
			'max-lines': ['error', { max: 400, skipBlankLines: true, skipComments: true }],
			'max-lines-per-function': [
				'error',
				{ max: 150, skipBlankLines: true, skipComments: true },
			],
			'no-console': ['error', { allow: ['warn', 'error'] }],
			'no-param-reassign': 'error',
			'no-restricted-imports': [
				'error',
				{
					paths: [
						{
							name: '@angular/core',
							importNames: restrictedAngularCoreImports,
							message: noSignalsMessage,
						},
					],
				},
			],
			'no-ternary': 'error',
		},
	},
	{
		files: ['**/*.html'],
		extends: [angular.configs.templateRecommended, angular.configs.templateAccessibility],
		rules: {
			'@angular-eslint/template/button-has-type': 'error',
			'@angular-eslint/template/no-inline-styles': 'error',
			'@angular-eslint/template/prefer-control-flow': 'error',
			'@angular-eslint/template/prefer-self-closing-tags': 'error',
		},
	},
);
