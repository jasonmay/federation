import {
  TypeInfo,
  GraphQLType,
  GraphQLList,
  GraphQLNonNull,
  GraphQLCompositeType,
  GraphQLSchema,
  isListType,
  isScalarType,
  isEnumType,
  isCompositeType,
  isNonNullType,
  isNamedType,
  DocumentNode,
  visit,
  visitWithTypeInfo
} from 'graphql';


type Mutable<T> = { -readonly [P in keyof T]: T[P] };
type TraversedType = GraphQLCompositeType | GraphQLList<any> | GraphQLNonNull<any>

// in the future: resolving abstract (union/interface) types
// but doesn't fit with current policy model
function resolveToRawType({fieldType, foundNullYet}: {
    fieldType: GraphQLType;
    foundNullYet?: boolean;
  }): [GraphQLType, boolean] {
  let nullFound = false;
  if (isListType(fieldType) || isNonNullType(fieldType)) {
    if (isNonNullType(fieldType)) {
      nullFound = true;
    }
    return resolveToRawType({
      fieldType: fieldType.ofType as TraversedType,
      foundNullYet: foundNullYet || nullFound || false,
    });
  }
  return [fieldType, foundNullYet ?? nullFound];
}

export function transformOperation({
  operation,
  schema,
  allowed,
  denied,
}: {
  operation: Mutable<DocumentNode>;
  schema: GraphQLSchema;
  allowed: Set<string>;
  denied: Set<string>;
}): DocumentNode {
  let typeInfo = new TypeInfo(schema);
  return visit(operation, visitWithTypeInfo(typeInfo, {
    Field: {
      enter(node) {
        let nodeType = typeInfo.getType();
        if (node.name.value === "body") {
          debugger;
        }
        let [, nullFound] = resolveToRawType({fieldType: typeInfo.getType()!});
        let parentType = typeInfo.getParentType()!
        let resolvedTypeName = parentType.name; // TODO: loop when we want to work with abstract types
        let fieldName = node.name.value;
        let fqFieldName = `${resolvedTypeName}.${fieldName}`;
        if (!allowed.has(fqFieldName) || (denied && denied.has(fqFieldName))) {
          if (nullFound) {
            throw new Error("Restriction on a non-nullable type not permitted");
          }
          else {
            return null;
          }
        }
        return node;
      },
      leave(node) {
        let nodeType = typeInfo.getType();
        let [fieldType] = resolveToRawType({fieldType: typeInfo.getType()!});
        if (isCompositeType(fieldType) && !node.selectionSet?.selections.length) {
          let parent = typeInfo.getParentType()
          if (isNamedType(parent) && parent.name == "Query") {
            throw new Error("None of the fields in the query are permitted.");
          }
          return null;
        }
        return node;
      }
    }
  }));
}
