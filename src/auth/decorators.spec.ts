import 'reflect-metadata';
import { Public, IS_PUBLIC_KEY } from './public.decorator';
import { Roles, ROLES_KEY } from './roles.decorator';

// Looks up a class method's own function value by name via its property
// descriptor rather than plain `Klass.prototype.method` dot-access -- the
// latter is flagged by @typescript-eslint/unbound-method (referencing a
// class method without calling it), even though nothing here ever invokes
// it with a `this` binding; we only need the function object itself to read
// the metadata Nest's SetMetadata attached to it.
function getMethod(ctor: { prototype: object }, name: string): object {
  const value: unknown = Object.getOwnPropertyDescriptor(
    ctor.prototype,
    name,
  )?.value;
  if (typeof value !== 'function') {
    throw new Error(`Expected ${name} to be a method`);
  }
  return value;
}

describe('@Public()', () => {
  it('attaches isPublic=true metadata to a decorated method', () => {
    class TestController {
      @Public()
      handler() {
        return undefined;
      }
    }

    const metadata: unknown = Reflect.getMetadata(
      IS_PUBLIC_KEY,
      getMethod(TestController, 'handler'),
    );
    expect(metadata).toBe(true);
  });

  it('leaves a non-decorated method without the metadata', () => {
    class TestController {
      handler() {
        return undefined;
      }
    }

    const metadata: unknown = Reflect.getMetadata(
      IS_PUBLIC_KEY,
      getMethod(TestController, 'handler'),
    );
    expect(metadata).toBeUndefined();
  });
});

describe('@Roles()', () => {
  it('attaches the given roles as metadata on a decorated method', () => {
    class TestController {
      @Roles('ts-icon-admin', 'ts-icon-editor')
      handler() {
        return undefined;
      }
    }

    const metadata: unknown = Reflect.getMetadata(
      ROLES_KEY,
      getMethod(TestController, 'handler'),
    );
    expect(metadata).toEqual(['ts-icon-admin', 'ts-icon-editor']);
  });

  it('supports a single role', () => {
    class TestController {
      @Roles('ts-icon-admin')
      handler() {
        return undefined;
      }
    }

    const metadata: unknown = Reflect.getMetadata(
      ROLES_KEY,
      getMethod(TestController, 'handler'),
    );
    expect(metadata).toEqual(['ts-icon-admin']);
  });
});
