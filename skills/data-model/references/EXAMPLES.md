# Data Model Examples (Bad -> Good)

Use these snippets for fast pattern selection.

## 1) Loose dict -> typed model

Bad:
```python
payload = {"name": "gen1", "rating_mw": 100}
```

Good:
```python
from typing import Annotated
from pydantic import BaseModel, Field

class GeneratorInput(BaseModel):
    name: Annotated[str, Field(min_length=1, description="Generator name")]
    rating_mw: Annotated[float, Field(gt=0, description="Installed capacity in MW")]
```

## 2) `Union[...]` -> `|`

Bad:
```python
from typing import Union
x: Union[int, None]
```

Good:
```python
x: int | None
```

## 3) Free-form string domain -> Enum

Bad:
```python
emission_type: str
```

Good:
```python
from enum import Enum

class EmissionType(str, Enum):
    CO2 = "CO2"
    NOX = "NOx"

emission_type: EmissionType
```

## 4) Raw URL string -> semantic type

Bad:
```python
db_url: str
```

Good:
```python
from typing import Annotated
from pydantic import Field, PostgresDsn

db_url: Annotated[PostgresDsn, Field(description="Database connection URL")]
```

## 5) Mutable literal default -> `default_factory`

Bad:
```python
services: list[str] = []
metadata: dict[str, str] = {}
```

Good:
```python
from typing import Annotated
from pydantic import Field

services: Annotated[list[str], Field(default_factory=list, description="Service names")]
metadata: Annotated[dict[str, str], Field(default_factory=dict, description="Metadata tags")]
```

## 6) Repeated constrained float -> alias

Bad:
```python
efficiency: Annotated[float, Field(ge=0, le=1, description="...")]
availability: Annotated[float, Field(ge=0, le=1, description="...")]
```

Good:
```python
from typing import Annotated, TypeAlias
from pydantic import Field

UnitFloat: TypeAlias = Annotated[float, Field(ge=0, le=1)]
```

## 7) Fragile `@computed_field` core state -> stored field/method

Bad:
```python
@computed_field
@property
def function_data_type(self) -> str | None:
    ...
```

Good:
```python
function_data_type: Annotated[str | None, Field(default=None, description="Function data type")]

def get_function_data_type(self) -> str | None:
    return self.function_data_type
```

## 8) Decorator serializer -> `Annotated + PlainSerializer`

Bad:
```python
@field_serializer("number")
def ser_number(self, v: int) -> int:
    return v * 2
```

Good:
```python
from typing import Annotated
from pydantic import PlainSerializer

DoubleNumber = Annotated[int, PlainSerializer(lambda v: v * 2)]
```

## 9) Rename internal field for API -> alias

Bad:
```python
class Asset(BaseModel):
    Max_Capacity: float
```

Good:
```python
max_capacity: Annotated[
    float,
    Field(ge=0, description="Maximum capacity", serialization_alias="Max Capacity"),
]
```

## 10) Over-serialized payload -> selective dump

Good sparse/clean payload options:
```python
payload_patch = model.model_dump(exclude_unset=True)
payload_no_none = model.model_dump(exclude_none=True)
```

## 11) In-place update immutable model -> `model_copy`

Bad:
```python
m.banana = 0
```

Good:
```python
m2 = m.model_copy(update={"banana": 0})
m3 = m.model_copy(deep=True)
```

## 12) Raw env parsing -> `pydantic-settings`

Bad:
```python
import os
DB_URL = os.environ["DB_URL"]
```

Good:
```python
from typing import Annotated
from pydantic import Field, PostgresDsn
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="APP_", env_file=".env")
    db_url: Annotated[PostgresDsn, Field(description="Database URL")]
```
