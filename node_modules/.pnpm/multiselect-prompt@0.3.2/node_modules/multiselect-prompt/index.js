'use strict'

const ui =       require('cli-styles')
const esc =      require('ansi-escapes')
const chalk =    require('chalk')
const figures =  require('figures')
const wrap =     require('prompt-skeleton')



const MultiselectPrompt = {

	  reset: function () {
		for (let v of this.value) v.selected = false
		this.cursor = 0
		this.emit()
		this.render()
	}

	, selected: function () {
		return this.value.filter((v) => v.selected)
	}

	, abort: function () {
		this.done = this.aborted = true
		this.emit()
		this.render()
		this.out.write('\n')
		this.close()
	}

	, submit: function () {
		this.done = true
		this.aborted = false
		this.emit()
		this.render()
		this.out.write('\n')
		this.close()
	}



	, first: function () {
		this.cursor = 0
		this.render()
	}
	, last: function () {
		this.cursor = this.value.length - 1
		this.render()
	}

	, up: function () {
		if (this.cursor === 0) return this.bell()
		this.cursor--
		this.render()
	}
	, down: function () {
		if (this.cursor === (this.value.length - 1)) return this.bell()
		this.cursor++
		this.render()
	}
	, next: function () {
		this.cursor = (this.cursor + 1) % this.value.length
		this.render()
	}

	, left: function () {
		this.value[this.cursor].selected = false
		this.render()
	}
	, right: function () {
		if (this.value.filter (e => e.selected).length >= this.maxChoices)
			return this.bell()

		this.value[this.cursor].selected = true
		this.render()
	}

	, _: function (c) { // on space key
		if (c !== ' ') return this.bell()
		const v = this.value[this.cursor]

		if (v.selected) {
			v.selected = false
			this.render()
		}
		else if (this.value.filter (e => e.selected).length >= this.maxChoices)
			return this.bell()
		else {
			v.selected = true
			this.render()
		}
	}



	, lastRendered: ''

	, render: function (first) {
		if (first) this.out.write(esc.cursorHide)

		let prompt = [
			  ui.symbol(this.done, this.aborted)
			, chalk.bold(this.msg)
			, this.done ? '' : chalk.gray(this.hint)
		].join(' ')

		if (!this.done) {
			const c = this.cursor
			prompt += '\n' + this.value.map((v, i) =>
				(v.selected ? chalk.green(figures.tick) : ' ') + ' '
				+ (c === i ? chalk.cyan.underline(v.title) : v.title)
			).join('\n')
		}

		this.out.write(ui.clear(this.lastRendered) + prompt)
		this.lastRendered = prompt
	}
}



const defaults = {
	  hint:    '– Space to select. Return to submit.'
	, value:   []
	, cursor:  0

	, done:    false
	, aborted: false
}

const multiselectPrompt = (msg, values, opt) => {
	if ('string' !== typeof msg) throw new Error('Message must be string.')
	if (!Array.isArray(values)) throw new Error('Values must be in an array.')
	if (Array.isArray(opt) || 'object' !== typeof opt) opt = {}

	values = values.map((v) => {
		v = Object.create(v)
		if (!('selected' in v)) v.selected = false
		return v
	})

	let p = Object.assign(Object.create(MultiselectPrompt), defaults, opt)
	p.msg = msg
	p.value = values // singular for compatibility with prompt-skeleton

	return wrap(p)
}



module.exports = Object.assign(multiselectPrompt, {MultiselectPrompt})
