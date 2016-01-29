# typedoc-plantuml
**Plugin for TypeDoc that generates images for PlantUML diagrams embedded in comments.**

## Installation

The plugin can then be installed using [npm](https://www.npmjs.com/):
 
```sh
$ npm install typedoc-plantuml --save-dev
```

## Usage

TypeDoc automatically detects plugins installed via npm. After installation TypeDoc can be used normally and UML 
diagrams in comments will be processed. 

By default, the plugin generates local PNG files for the UML diagrams. However, if you add the option `--umlLocation remote` 
to the command line, the plugin will instead create embedded image links to the 
[plantuml server](http://www.plantuml.com/plantuml/).

The start of a UML diagram is indicated by the `<uml>` tag and closed by the `</uml>` tag. Alternate text for the
generated image can optionally be specified using the `alt` attribute. For example `<uml alt="Some diagram">`.

Note that the parser that finds the xml tags in the comment text is not very smart, so avoid unnecessary whitespace or 
other attributes to the tag. Also note that the first paragraph in the comment text will not be processed for UML 
diagrams.

The following is an example of embedding a sequence diagram in a class description.
  
```typescript
/**
 * Some class in a project.
 *
 * <uml>
 *     Bob->Alice : hello
 * </uml>
 */
export class SomeClass {

}
```

You can view the generated documentation [here](https://rawgit.com/artifacthealth/typedoc-plantuml/master/tests/baselines/reference/basic/classes/someclass.html).

Please refer to the [plantuml website](http://plantuml.com/) for a full reference on the supported UML syntax.


## License

Licensed under the Apache License 2.0.  