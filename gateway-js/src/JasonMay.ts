import {
  TypeInfo,
  GraphQLType,
  GraphQLObjectType,
  GraphQLNamedType,
  GraphQLSchema,
  isAbstractType,
  isWrappingType,
  isCompositeType,
  isNonNullType,
  isNamedType,
  DocumentNode,
  print,
  visit,
  visitWithTypeInfo
} from 'graphql';


export function typesFromInfo(options: {typeInfo: TypeInfo, schema: GraphQLSchema}): Array<GraphQLObjectType> {
  let fieldType: GraphQLType = options.typeInfo.getType()!;
  if ("ofType" in fieldType) {
    fieldType = fieldType.ofType;
  }
  let fieldObjectType = fieldType as GraphQLObjectType;
  let typeName = fieldObjectType;
  if (isAbstractType(fieldObjectType)) {
    let possibleTypes = options.schema.getPossibleTypes(fieldObjectType);
    return possibleTypes.map((t) => t);
  }
  return [typeName];
}

export function isEntity(gType: GraphQLObjectType) {
  // TODO use gType.extensionASTNodes isn't null in real app
  let s = new Set(["Book", "Furniture"]);
  return s.has(gType.name);
}

type Mutable<T> = { -readonly [P in keyof T]: T[P] };

// in the future: resolving abstract (union/interface) types
// but doesn't fit with current policy model
function resolveToRawObjectTypes(fieldType: GraphQLType): [Array<GraphQLNamedType & { name: string }>, boolean] {
  let typeQueue: Array<GraphQLType> = [fieldType];
  let answer: Array<GraphQLNamedType> = [];
  let nullFound = false;
  while (typeQueue.length) {
    let fieldType = typeQueue.shift();
    if (isWrappingType(fieldType)) {
      if (isNonNullType(fieldType)) {
        nullFound = true;
      }
      typeQueue.push(fieldType.ofType);
    }
    else {
      // make the assumption that the type will be named at this point
      answer.push(fieldType as GraphQLNamedType);
    }
  }
  return [answer, nullFound];
}

export function transformOperation(cfg: {
  operation: Mutable<DocumentNode>,
  schema: GraphQLSchema,
  allowed: Set<string>,
  denied: Set<string>
}): DocumentNode {
  let typeInfo = new TypeInfo(cfg.schema);
  return visit(cfg.operation, visitWithTypeInfo(typeInfo, {
    Field: {
      enter(node) {
        let [types, nullFound] = resolveToRawObjectTypes(typeInfo.getParentType()!);
        let resolvedTypeName = types[0].name; // TODO: loop when we want to work with abstract types
        let fieldName = node.name.value;
        let fqFieldName = `${resolvedTypeName}.${fieldName}`;
        if (!cfg.allowed.has(fqFieldName) || (cfg.denied && cfg.denied.has(fqFieldName))) {
          if (nullFound) {
            throw new Error("Restriction on a non-nullable type not permitted");
          }
          else {
            debugger;
            return null;
          }
        }
        return node;
      },
      leave(node) {
        let [types] = resolveToRawObjectTypes(typeInfo.getType()!);
        let fieldType = types[0];
        if (isCompositeType(fieldType) && !node.selectionSet?.selections.length) {
          let p = print;
          debugger;
          let parent = typeInfo.getParentType()
          if (isNamedType(parent) && parent.name == "Query") {
            debugger;
            throw new Error("None of the fields in the query are permitted.");
          }
          return null;
        }
        return node;
      }
    }
  }));
}
