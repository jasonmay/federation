import {
  TypeInfo,
  GraphQLType,
  GraphQLList,
  GraphQLNonNull,
  GraphQLCompositeType,
  GraphQLSchema,
  isListType,
  isCompositeType,
  isNonNullType,
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
        let [, nullFound] = resolveToRawType({fieldType: typeInfo.getType()!});
        let parentType = typeInfo.getParentType()!
        let resolvedTypeName = parentType.name; // TODO: loop when we want to work with abstract types
        let fieldName = node.name.value;
        let fqFieldName = `${resolvedTypeName}.${fieldName}`;

        if (!allowed.has(fqFieldName) || (denied && denied.has(fqFieldName))) {
          if (parentType.name === "Mutation") {
            if (node.selectionSet?.selections.length ?? 0 <= 1) {
              throw new Error("No mutations in operation are permitted");
            }
          }
          if (nullFound) {
            throw new Error(`Restriction on a non-nullable type on '${fqFieldName}' not permitted`);
          }
          else {
            return null;
          }
        }
        return undefined;
      },
      leave(node) {
        let [fieldType] = resolveToRawType({fieldType: typeInfo.getType()!});
        if (isCompositeType(fieldType) && !node.selectionSet?.selections.length) {
          let parent = typeInfo.getParentType()!
          if (parent.name === "Query" || parent.name === "Mutation") {
            throw new Error("None of the items in the operation are permitted.");
          }
          return null;
        }
        return undefined;
      }
    },
    InlineFragment: {
      leave(node) {
        // When fields are redacted, sometimes InlineFragments are left empty
        if (!node.selectionSet?.selections.length) {
          return null;
        }
        return undefined;
      }
    },
    FragmentDefinition: {
      leave(node) {
        // When fields are redacted, sometimes FragmentDefinitions are left empty
        if (!node.selectionSet?.selections.length) {
          return null;
        }
        return undefined;
      }
    }
  }));
}
