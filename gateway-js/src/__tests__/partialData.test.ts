import { GraphQLError } from 'graphql';
import { print } from 'graphql/language';
import gql from 'graphql-tag';
import { astSerializer, queryPlanSerializer } from '../snapshotSerializers';
import { getFederatedTestingSchema } from './execution-utils';
import { ComposedGraphQLSchema } from '@apollo/federation';
import { transformOperation } from '../JasonMay';

expect.addSnapshotSerializer(astSerializer);
expect.addSnapshotSerializer(queryPlanSerializer);

describe('partialDataQueryPlan', () => {
  let schema: ComposedGraphQLSchema;
  let errors: GraphQLError[];

  const transformOp = ({
    operationString,
    allowed,
    denied,
  }: {
    operationString: string;
    allowed: Set<string>;
    denied: Set<string>;
  }) => {
    let operationDocument = gql(operationString);
    let newOperation = transformOperation({
      operation: operationDocument,
      schema,
      allowed,
      denied,
    });
    return print(newOperation);
  };

  beforeEach(() => {
    ({ schema, errors } = getFederatedTestingSchema());
    expect(errors).toHaveLength(0);
  });

  // GraphQLError: Cannot query field "isbn" on type "Book"
  // Probably an issue with extending / interfaces in composition. None of the fields from the base Book type
  // are showing up in the resulting schema.
  it(`should allow/deny properly`, () => {
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

    let newOperationString = transformOp({
      operationString,
      allowed: new Set([
        'Query.topProducts',
        'Product.price',
        'Product.reviews',
      ]),
      denied: new Set<string>(),
    });
    expect(newOperationString).toMatchInlineSnapshot(`
      "{
        topProducts {
          price
        }
      }
      "
    `);
    // Test deny by default

    newOperationString = transformOp({
      operationString,
      allowed: new Set([
        'Query.topProducts',
        'Product.price',
        'Product.reviews',
        'Review.body',
      ]),
      denied: new Set(['Review.body']),
    });
    expect(newOperationString).toMatchInlineSnapshot(`
      "{
        topProducts {
          price
        }
      }
      "
    `);
  });

  it(`should throw when no queries are permitted`, () => {
    const operationString = `#graphql
      query {
        body
        topProducts {
          price
        }
      }
    `;

    expect(() => {
      transformOp({
        operationString,
        allowed: new Set(['Query.topProducts', 'Product.reviews']),
        denied: new Set(),
      });
    }).toThrowError();
  });

  it(`should throw when a non-nullable field is restricted`, () => {
    const operationString = `#graphql
      query {
        topProducts {
          upc
          price
        }
      }
    `;

    expect(() => {
      transformOp({
        operationString,
        allowed: new Set(['Query.topProducts', 'Product.price']),
        denied: new Set(['Review.body']),
      });
    }).toThrowError();
  });

  it(`should allow mutation`, () => {
    const operationString = `#graphql
      mutation {
        createReview(upc: "1", body: "cool")
      }
    `;

    let newOperationString = transformOp({
      operationString,
      allowed: new Set(['Mutation.createReview']),
      denied: new Set(),
    });
    expect(newOperationString).toMatchInlineSnapshot(`
      "mutation {
        createReview(upc: \\"1\\", body: \\"cool\\")
      }
      "
    `);
  });

  it(`should redact mutation`, () => {
    const operationString = `#graphql
      mutation {
        createReview(upc: "1", body: "cool")
      }
    `;

    expect(() => {
      let o = transformOp({
        operationString,
        allowed: new Set(),
        denied: new Set(),
      });
      console.warn(o);
    }).toThrowError();
  });
});
