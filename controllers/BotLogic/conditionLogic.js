const conditionLogic = (data) => {
    const list = []

    for (const [i, item] of data.entries()) {
        const next = i + 1
        const back = i - 1

        if (item.addConditional === "OR") {
            list.push(item?.result || data[next]?.result)
        }

        if (item.addConditional === "AND") {
            list.push(item?.result && data[next]?.result)
        }

        if (item.addConditional === "Final") {
            if (item?.result && data[back]?.result === undefined) {
                list.push(true)
            } else if (!item?.result && data[back]?.result === undefined) {
                list.push(false)
            } else if (item?.result && data[back]?.result && data[back].addConditional === "AND") {
                list.push(true)
            } else if (!item?.result && data[back]?.result && data[back].addConditional === "AND") {
                list.push(false)
            } else if (item?.result && !data[back]?.result && data[back].addConditional === "AND") {
                list.push(false)
            } else if (!item?.result && !data[back]?.result && data[back].addConditional === "AND") {
                list.push(false)
            } else if (item?.result && data[back]?.result && data[back].addConditional === "OR") {
                list.push(true)
            } else if (item?.result && !data[back]?.result && data[back].addConditional === "OR") {
                list.push(true)
            } else if (!item?.result && data[back]?.result && data[back].addConditional === "OR") {
                list.push(true)
            } else if (!item?.result && !data[back]?.result && data[back].addConditional === "OR") {
                list.push(false)
            } else {
                console.log('Warning: Missing if statment for Final condition', item)
            }
        }
    }

    let final = null

    if (list.includes(false) || list.length === 0) {
        final = false
    } else {
        final = true
    }

    return final
}

module.exports = conditionLogic