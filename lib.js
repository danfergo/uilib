
function Util(){
  this.flatMap = function(array, lambda) {
     return Array.prototype.concat.apply([], array.map(lambda));
  }

  this.nestOne = function(array1, array2, comparator, key) {
      return array1.map(function(elem1){
        return Object.assign({}, elem1, {
          [key] : array2.find(function(elem2){
            return comparator(elem1, elem2);
          })
        })
      })
  }

  this.nestMany = function(array1, array2, comparator, key) {
      return array1.map(function(elem1){
        return Object.assign({}, elem1, {
          [key] : array2.filter(function(elem2){
            return comparator(elem1, elem2);
          })
        })
      })
  }

}

// Leveraging "Ajax" and Promises requests to fetch data from json files.
// https://www.w3schools.com/xml/tryit.asp?filename=tryajax_first
// https://www.w3schools.com/js/js_json_parse.asp
function Http(){
  var self = this;

  this.getJson = function(url, onSuccess, onError){
      var xhttp = new XMLHttpRequest();
      xhttp.onreadystatechange = function() {
        if (this.readyState == 4) {
          if(this.status == 200){
            onSuccess(JSON.parse(this.responseText), this)
          }else {
            onError(this);
          }
        }
      };
      xhttp.open("GET", url, true);
      xhttp.send();
  }

  // Async calls (and chains) are better with promises.
  // https://developer.mozilla.org/pt-BR/docs/Web/JavaScript/Reference/Global_Objects/Promise
  this.getJsonP = function(url){
    return new Promise(function(resolve, reject){
      self.getJson(url, resolve, reject);
    })
  }
}


// A quick function that will allow us to get params from URL query
// e.g. id?=10&age=20
// see https://stackoverflow.com/questions/8486099/how-do-i-parse-a-url-query-parameters-in-javascript
function Location(url){

  this.params = function() {
    var query = url ? url.substr(url.indexOf("?")+1) : location.search.substr(1);
    var result = {};
    query.split("&").forEach(function(part) {
      var item = part.split("=");
      result[item[0]] = decodeURIComponent(item[1]);
    });
    return result;
  }
}


// Using JavaScript prototype based inheritance
// and eval to create an (dynamic) hierachy of scopes.
// This will be necessary to have fors/dynamic content.
// Usage:
// var rootScope = new Scope({ x: 1, y: 2 });
// var childScope = rootScope.pushScope({ y:20 });
// console.log('root ', rootScope.evaluate(" x * y "));
// console.log('child ', childScope.evaluate(" x * y "));
function Scope(variables, parentScope){
  this.variables = variables || {};
  this.variables.__proto__ = parentScope ? parentScope.variables : null;
  var self = this;


  // Eval is bad and unsafe and With is deprecated, but this is a quick way of having an interpreter.
  // https://developer.mozilla.org/pt-PT/docs/Web/JavaScript/Reference/Global_Objects/Function/apply
  // https://stackoverflow.com/questions/8403108/calling-eval-in-particular-context
  // http://webreflection.blogspot.pt/2009/12/with-worlds-most-misunderstood.html
  this.evaluate = function(expression) {
    return function() {
        return eval('with(this) {' + expression + '}');
    }.call(self.variables);
  }

  this.pushScope = function(variables){
    return new Scope(variables, this);
  }

}


function Renderer(){
  var self = this;
  var util = new Util();

  this.transforms = {
    // usage: for="element, index of elements"
    for: function(element, scope){
       var forExpression = element.getAttribute('for');
       var leftRightSides = forExpression.split(' of ');

       var iteratorsNames = leftRightSides[0].split(',');
       var iterElem = iteratorsNames[0].trim();
       var iterIdx = iteratorsNames.length > 1 ? iteratorsNames[1].trim() : '$index';
       var collectionName = leftRightSides[1];
       var collection = scope.evaluate(collectionName);

       if(!collection.map){
         console.log(collection)
         throw 'Error: ' + collectionName+ ' is not an array';
       }
       return collection.map(function(element, index){
         // the [] notation, javascript is brutal :D
         return scope.pushScope({
           [iterElem]: element,
           [iterIdx]: index,
           '$first': index == 0,
           '$last': index == collection.length - 1
         })
       })
    },
    // usage: if="something && somethingElse == true"
    if: function(element, scope){
       var conditionExp = element.getAttribute("if");
       if(scope.evaluate(conditionExp)){
         return [scope]
       }else {
         return []
       }
    }
  }


  // Recursively renders DOM text nodes and element's attributes; and apply if/for transformations.
  // Follow the rabbit...
  this.render = function(root, scope){
    for(var i = 0; i < root.childNodes.length; i++){
      var child = root.childNodes[i];
      switch (child.nodeType){
        case 1:
          this.renderElement(child, scope);
          break;
        case 3:
          this.renderTextNode(child, scope);
          break;
      }
    }
  }

  // Replaces {{ someThing.property }} with the respective value.
  this.renderTextNode = function(element, scope){
    try{
      element.textContent = this.findExpressions(element.textContent, scope.evaluate);
    }catch(err){
      element.innerHTML = '<font color="red" size="5">' + err+ ' @ {{...}}</font>';
      return;
    }
  }

  // Regex's are always cool.
  this.findExpressions = function(html, evaluator){
    return html.replace(/{{[^}]*}}/g, function(exp){
      return evaluator(exp);
    })
  }

  this.renderElement = function(element, scope){
    try{
        var scopes = this.generateScopes(element, scope);
    }catch(err){
      element.innerHTML = '<font color="red" size="5">' + err+ ' @ if/for</font>';
      return;
    }

    if(scopes){
      element.removeAttribute('if');
      element.removeAttribute('for');
      var anchor = document.createComment('comment lib');
      element.parentNode.replaceChild(anchor, element);
      var pointer = anchor;
      scopes.forEach(function(scope){
        var newElement = element.cloneNode(true);
        pointer.parentNode.insertBefore(newElement, pointer.nextSibling);
        self.render(newElement, scope);
        self.renderAttributes(newElement, scope);
        pointer = newElement;
      });
    }else {
      this.render(element, scope);
      this.renderAttributes(element, scope);
    }
  }

  this.generateScopes = function(element, scope){
    let scopes = null;
    for(var transform in this.transforms){
      if(element.hasAttribute(transform)){
        scopes = util.flatMap(scopes || [scope], function(s) {
          return self.transforms[transform](element, s);
        })
      }
    }
    return scopes;
  }


  this.renderAttributes = function(element, scope){
    Array.from(element.attributes).forEach(function(attribute){
      try{
        var evaluatedVal = self.findExpressions(attribute.value, scope.evaluate);
        if(evaluatedVal != attribute.value){
          element.setAttribute(attribute.name, evaluatedVal);
        }
      }catch(err){
        element.innerHTML = '<font color="red" size="5">' + err+ ' @ {{...}}</font>';
        return;
      }
    })
  }
}

// Wrapping it all up into an easy to use format.
function Mockup(dataSources, dataHandler){
  var http = new Http();
  var renderer = new Renderer();
  var location = new Location();
  var util = new Util();

  var self = this;

  dataSources = Array.isArray(dataSources) ? dataSources : [dataSources];
  // performing multiple async Ajax calls simultaneously, using Promises.
  Promise
    .all(dataSources.map(function(dataSource){
        return http.getJsonP(dataSource)
    }))
    .then(function(results){
        var variables = {};
        if(typeof dataHandler === "string"){
          variables = {
            [dataHandler]: results[0]
          };
        } else if(Array.isArray(dataHandler)){
          dataHandler.forEach(function(key,i){
            variables[key] = results[i];
          })
        } else {
          // Using apply to pass arguments from an array.
          variables = dataHandler.apply(null, results.concat([location.params(), util]));
        }
        console.log(results);
        renderer.render(document.body, new Scope(variables));
    })

}
