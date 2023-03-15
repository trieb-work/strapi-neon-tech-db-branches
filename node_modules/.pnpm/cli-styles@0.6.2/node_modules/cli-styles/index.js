'use strict'

const chalk =   require('chalk')
const figures = require('figures')
const window = require('window-size')
const ansi = require('ansi-escapes')
const split = require('split-lines')
const width = require('string-width')



// For showing the user's input.
const styles = Object.freeze({
	password:  (input) => '*'.repeat(input.length),
	invisible: (input) => '',
	default:   (input) => input
})
const render = (type) => styles[type] || styles.default

// An icon to signalize a prompt.
const symbols = Object.freeze({
	aborted: chalk.red(figures.cross),
	done:    chalk.green(figures.tick),
	default: chalk.cyan('?')
})
const symbol = (done, aborted) =>
	aborted ? symbols.aborted : (done ? symbols.done : symbols.default)

// Between the question and the user's input.
const delimiter = (completing) =>
	chalk.gray(completing ? figures.ellipsis : figures.pointerSmall)

const item = (expandable, expanded) =>
	chalk.gray(expandable ? (expanded ? figures.pointerSmall : '+') : figures.line)

// Generate ANSI chars to clear the whole prompt.
const clear = (prompt, perLine = window.width) => {
	if (!perLine) return ansi.eraseLine + ansi.cursorTo(0)

	let rows = 0
	const lines = split(prompt)
	for (let line of lines) {
		rows += 1 + Math.floor(Math.max(width(line) - 1, 0) / perLine)
	}

	return (ansi.eraseLine + ansi.cursorPrevLine).repeat(rows - 1)
		+ ansi.eraseLine + ansi.cursorTo(0)
}



module.exports = Object.freeze({
	styles,
	render,
	symbols,
	symbol,
	delimiter,
	item,
	clear
})
