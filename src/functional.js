const {reportIssue, transformSourceString, getFunctionBody, transformComponentName} = require('./utility')
const generate = require('@babel/generator').default

module.exports = function (path, fileContent, result, funcType = null) {
  let funcCom = {
    components: [],
    functional: true,
    componentName: funcType === 'arrow' ? path.parentPath.node.id.name : path.node.id.name
  }
  let extraCode = ''
  let paramsPath = path.get('params.0')
  let originalPropName = ''
  if (!paramsPath) {
    // it means there is no params
  } else if (paramsPath.isObjectPattern()) {
    let node = paramsPath.node
    extraCode = `let ${fileContent.slice(node.start, node.end)} = c.props`
  } else if (paramsPath.isAssignmentPattern()) {
    let node = paramsPath.node.left
    extraCode = `let ${fileContent.slice(node.start, node.end)} = c.props`
  } else if (paramsPath.isIdentifier()) {
    // record original prop name
    originalPropName = paramsPath.node.name
    extraCode = `const ${originalPropName} = c.props`
  } else {
    reportIssue(`Unknow params for '${funcCom.componentName}'`)
  }
  
  // retrieve sub component
  path.traverse({
    JSXElement (jsxPath) {
      let element = jsxPath.node.openingElement
      // find sub component
      if (element.name && element.name.name && /^[A-Z]/.test(element.name.name)) {
        funcCom.components.push(element.name.name)
        let name = transformComponentName(element.name.name)
        element.name.name = name
        if (jsxPath.node.closingElement) {
          jsxPath.node.closingElement.name.name = name
        }
      }
    },
    MemberExpression (memPath) {
      if (memPath.node.property.name === 'children' && memPath.node.object.name === originalPropName) {
        memPath.node.object.name = 'c'
      }
    },
    JSXAttribute (attrPath) {
      let node = attrPath.node
      if (node.name.name === 'className') {
        node.name.name = 'class'
      } else if (node.name.name === 'dangerouslySetInnerHTML') {
        node.name.name = 'domPropsInnerHTML'
        let expression = attrPath.get('value.expression')
        if (expression.isIdentifier()) {
          expression.replaceWithSourceString(`${expression.node.name}.__html`)
        } else {
          expression.replaceWith(expression.get('properties.0.value'))
        }
      }
    }
  })
  
  if (funcCom.componentName !== result.exportName) {
    // get code
    let code = getFunctionBody(path, false)
    //if it's a common function
    result.functional.push(`const ${funcCom.componentName} = ${code}`)
    return
  } else if (extraCode) {
    //add the extra code into blockstatement
    let astFrag = transformSourceString(extraCode)
    path.get('body.body.0').insertBefore(astFrag)
  }
  
  // get code
  let code = getFunctionBody(path.get('body'))
  funcCom.render = `render (h, c) {${code}}`
  // add funcCom into result
  result.functional.push(funcCom)
}
