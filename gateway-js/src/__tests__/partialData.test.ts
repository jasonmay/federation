import { GraphQLError } from 'graphql';
import gql from 'graphql-tag';
import { buildQueryPlan, buildOperationContext } from '../buildQueryPlan';
import { astSerializer, queryPlanSerializer } from '../snapshotSerializers';
import { getFederatedTestingSchema } from './execution-utils';
import { ComposedGraphQLSchema } from '@apollo/federation';
import { WasmPointer } from '../QueryPlan';
import { transformOperation } from '../JasonMay';

expect.addSnapshotSerializer(astSerializer);
expect.addSnapshotSerializer(queryPlanSerializer);

describe('partialDataQueryPlan', () => {
  let schema: ComposedGraphQLSchema;
  let errors: GraphQLError[];
  let queryPlannerPointer: WasmPointer;

  beforeEach(() => {
    ({ schema, errors, queryPlannerPointer } = getFederatedTestingSchema());
    expect(errors).toHaveLength(0);
  });

  // GraphQLError: Cannot query field "isbn" on type "Book"
  // Probably an issue with extending / interfaces in composition. None of the fields from the base Book type
  // are showing up in the resulting schema.
  it(`should break up when traversing an extension field on an interface type from a service`, () => {
    const operationString = `#graphql
      query {
        topProducts {
          price
          reviews {
            body
          }
        }
      }
    `;

    const operationDocument = gql(operationString);

    let allowed = new Set([
      "Query.topProducts",
      "Product.price",
      "Product.reviews",
      "Review.body",
    ]);

    let denied: Set<string> = new Set();

    transformOperation({operation: operationDocument, schema, allowed, denied});

    const queryPlan = buildQueryPlan(
      buildOperationContext({
        schema,
        operationDocument,
        operationString,
        queryPlannerPointer,
      })
    );

    expect(queryPlan).toMatchInlineSnapshot(`
      QueryPlan {
        Sequence {
          Fetch(service: "product") {
            {
              topProducts {
                __typename
                ... on Book {
                  price
                  __typename
                  isbn
                }
                ... on Furniture {
                  price
                  __typename
                  upc
                }
              }
            }
          },
          Flatten(path: "topProducts.@") {
            Fetch(service: "reviews") {
              {
                ... on Book {
                  __typename
                  isbn
                }
                ... on Furniture {
                  __typename
                  upc
                }
              } =>
              {
                ... on Book {
                  reviews {
                    body
                  }
                }
                ... on Furniture {
                  reviews {
                    body
                  }
                }
              }
            },
          },
        },
      }
    `);
  });
});
